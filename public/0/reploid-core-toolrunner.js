const ToolRunnerModule = (config, logger, Storage, StateManager) => {
  if (!config || !logger || !Storage || !StateManager) {
    console.error(
      "ToolRunnerModule requires config, logger, Storage, and StateManager."
    );
    const log = logger || {
      logEvent: (lvl, msg) =>
        console[lvl === "error" ? "error" : "log"](
          `[TOOLRUNNER FALLBACK] ${msg}`
        ),
    };
    log.logEvent(
      "error",
      "ToolRunnerModule initialization failed: Missing dependencies."
    );
    return {
      runTool: async (toolName) => {
        throw new Error(`ToolRunner not initialized, cannot run ${toolName}`);
      },
    };
  }

  const DYNAMIC_TOOL_TIMEOUT_MS = config.DYNAMIC_TOOL_TIMEOUT_MS || 10000;

  function mapMcpTypeToGemini(mcpType) {
    switch (mcpType?.toLowerCase()) {
      case "string":
        return "STRING";
      case "integer":
        return "INTEGER";
      case "number":
        return "NUMBER";
      case "boolean":
        return "BOOLEAN";
      case "array":
        return "ARRAY";
      case "object":
        return "OBJECT";
      default:
        logger.logEvent("warn", `Unsupported MCP type encountered: ${mcpType}`);
        return "TYPE_UNSPECIFIED";
    }
  }

  function convertMcpPropertiesToGemini(mcpProps) {
    if (!mcpProps) return {};
    const geminiProps = {};
    for (const key in mcpProps) {
      const mcpProp = mcpProps[key];
      geminiProps[key] = {
        type: mapMcpTypeToGemini(mcpProp.type),
        description: mcpProp.description || "",
      };
      if (mcpProp.enum) {
        geminiProps[key].enum = mcpProp.enum;
      }
      if (mcpProp.type === "array" && mcpProp.items) {
        geminiProps[key].items = {
          type: mapMcpTypeToGemini(mcpProp.items.type),
        };
      }
      if (mcpProp.type === "object" && mcpProp.properties) {
        geminiProps[key].properties = convertMcpPropertiesToGemini(
          mcpProp.properties
        );
        if (mcpProp.required) {
          geminiProps[key].required = mcpProp.required;
        }
      }
    }
    return geminiProps;
  }

  async function runToolInternal(
    toolName,
    toolArgs,
    injectedStaticTools,
    injectedDynamicTools
  ) {
    logger.logEvent("info", `Run tool: ${toolName}`, toolArgs || {});
    const staticTool = injectedStaticTools.find((t) => t.name === toolName);

    if (staticTool) {
      let artifactContent;
      let artifactMetaData;
      if (
        toolArgs &&
        toolArgs.artifactId &&
        typeof toolArgs.cycle === "number"
      ) {
        artifactContent = Storage.getArtifactContent(
          toolArgs.artifactId,
          toolArgs.cycle
        );
        artifactMetaData = StateManager.getArtifactMetadata(
          toolArgs.artifactId
        );
        if (artifactContent === null && toolName !== "list_artifacts") {
          throw new Error(
            `Artifact content not found for ${toolArgs.artifactId} cycle ${toolArgs.cycle}`
          );
        }
      }

      switch (toolName) {
        case "code_linter":
          const code = artifactContent;
          let hasError = false;
          let errorMessage = "";
          try {
            if (toolArgs.language === "json") {
              JSON.parse(code);
            } else if (toolArgs.language === "html") {
              if (code.includes("<script") && !code.includes("</script>")) {
                hasError = true;
                errorMessage = "Potentially unclosed script tag.";
              }
            } else if (toolArgs.language === "javascript") {
              if (
                (code.match(/{/g) || []).length !==
                  (code.match(/}/g) || []).length ||
                (code.match(/\(/g) || []).length !==
                  (code.match(/\)/g) || []).length
              ) {
                hasError = true;
                errorMessage = "Mismatched braces or parentheses.";
              }
            }
          } catch (e) {
            hasError = true;
            errorMessage = e.message;
          }
          return {
            result: `Basic lint ${hasError ? "failed" : "passed"} for ${
              toolArgs.language
            }.${hasError ? " Error: " + errorMessage : ""}`,
            linting_passed: !hasError,
            error_message: hasError ? errorMessage : null,
          };

        case "json_validator":
          try {
            JSON.parse(artifactContent);
            return { result: "JSON structure is valid.", valid: true };
          } catch (e) {
            return {
              result: `JSON invalid: ${e.message}`,
              valid: false,
              error: e.message,
            };
          }

        case "read_artifact":
          return {
            content: artifactContent,
            artifactId: toolArgs.artifactId,
            cycle: toolArgs.cycle,
          };

        case "list_artifacts":
          const allMeta = StateManager.getAllArtifactMetadata();
          let filtered = Object.values(allMeta);
          if (toolArgs.filterType) {
            filtered = filtered.filter(
              (meta) =>
                meta.type &&
                meta.type.toUpperCase() === toolArgs.filterType.toUpperCase()
            );
          }
          if (toolArgs.filterPattern) {
            try {
              const regex = new RegExp(toolArgs.filterPattern);
              filtered = filtered.filter((meta) => regex.test(meta.id));
            } catch (e) {
              throw new Error(`Invalid regex pattern: ${e.message}`);
            }
          }
          return {
            artifacts: toolArgs.includeCycle
              ? filtered.map((meta) => ({
                  id: meta.id,
                  latestCycle: meta.latestCycle,
                  type: meta.type,
                }))
              : filtered.map((meta) => meta.id),
          };

        case "diff_text":
          const linesA = (toolArgs.textA || "").split("\n");
          const linesB = (toolArgs.textB || "").split("\n");
          if (toolArgs.textA === toolArgs.textB) {
            return { differences: 0, result: "Texts are identical." };
          }
          const diff = [];
          const maxLen = Math.max(linesA.length, linesB.length);
          let diffCount = 0;
          for (let i = 0; i < maxLen; i++) {
            if (linesA[i] !== linesB[i]) {
              diff.push(
                `L${i + 1}: A='${(linesA[i] || "").substring(0, 50)}' B='${(
                  linesB[i] || ""
                ).substring(0, 50)}'`
              );
              diffCount++;
            }
          }
          return {
            differences: diffCount,
            result: `Found ${diffCount} differing lines.`,
            details: diff.slice(0, 20),
          };

        case "convert_to_gemini_fc":
          const mcpDef = toolArgs.mcpToolDefinition;
          if (
            !mcpDef ||
            !mcpDef.name ||
            !mcpDef.inputSchema ||
            mcpDef.inputSchema.type !== "object"
          ) {
            throw new Error(
              "Invalid MCP tool definition provided for conversion."
            );
          }
          const geminiDecl = {
            name: mcpDef.name,
            description: mcpDef.description || "",
            parameters: {
              type: "OBJECT",
              properties: convertMcpPropertiesToGemini(
                mcpDef.inputSchema.properties
              ),
              required: mcpDef.inputSchema.required || [],
            },
          };
          return { geminiFunctionDeclaration: geminiDecl };

        case "code_edit":
          const { artifactId, cycle, newContent } = toolArgs;
          const originalContent = Storage.getArtifactContent(artifactId, cycle);
          if (originalContent === null) {
            throw new Error(
              `Original artifact not found for ${artifactId} cycle ${cycle}`
            );
          }
          let isValid = true;
          let validationError = null;
          const meta = StateManager.getArtifactMetadata(artifactId);

          if (meta && meta.type === "JSON") {
            try {
              JSON.parse(newContent);
            } catch (e) {
              isValid = false;
              validationError = `Invalid JSON: ${e.message}`;
            }
          } else if (meta && meta.type === "JS") {
            if (
              (newContent.match(/{/g) || []).length !==
                (newContent.match(/}/g) || []).length ||
              (newContent.match(/\(/g) || []).length !==
                (newContent.match(/\)/g) || []).length
            ) {
              isValid = false;
              validationError =
                "Mismatched braces or parentheses detected in JS.";
            }
            // Future: Consider adding lightweight AST parse check via worker/library
          } else if (meta && meta.type === "HTML") {
            if (
              newContent.includes("<script") &&
              !newContent.includes("</script>")
            ) {
              isValid = false;
              validationError =
                "Potentially unclosed script tag detected in HTML.";
            }
            // Future: Consider adding basic tag balancing check
          }

          return {
            success: isValid,
            validatedContent: isValid ? newContent : null,
            error: validationError,
            originalContent: originalContent,
            artifactId: artifactId,
            cycle: cycle,
            contentChanged: newContent !== originalContent,
          };

        default:
          logger.logEvent(
            "warn",
            `Static tool '${toolName}' execution logic not fully implemented or recognized.`
          );
          return {
            success: true,
            message: `Static tool ${toolName} placeholder executed.`,
            argsReceived: toolArgs,
          };
      }
    }

    const dynamicTool = injectedDynamicTools.find(
      (t) => t.declaration.name === toolName
    );
    if (dynamicTool) {
      if (!dynamicTool.implementation) {
        throw new Error(
          `Dynamic tool '${toolName}' has no implementation defined.`
        );
      }
      logger.logEvent(
        "info",
        `Executing dynamic tool '${toolName}' in Web Worker sandbox.`
      );

      return new Promise((resolve, reject) => {
        const workerCode = `
          let messageCallbacks = {};
          let messageIdCounter = 0;

          self.onmessage = async (event) => {
              const { type, payload, id, data, error } = event.data;

              if (type === 'init') {
                  const { toolCode, toolArgs } = payload;
                  try {
                      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                      const func = new AsyncFunction('params', 'LS', 'StateManager', toolCode + '\\n\\nreturn await run(params);');
                      const result = await func(toolArgs, self.LS_shim, self.StateManager_shim);
                      self.postMessage({ success: true, result: result });
                  } catch (e) {
                      const errorDetail = {
                          message: e.message || 'Unknown worker execution error',
                          stack: e.stack,
                          name: e.name
                      };
                      self.postMessage({ success: false, error: errorDetail });
                  } finally {
                      self.close();
                  }
              } else if (type === 'response') {
                  const callback = messageCallbacks[id];
                  if (callback) {
                      if (error) {
                          callback.reject(new Error(error.message || 'Worker shim request failed'));
                      } else {
                          callback.resolve(data);
                      }
                      delete messageCallbacks[id];
                  } else {
                      console.warn('Worker received response for unknown message ID:', id);
                  }
              }
          };

          function makeShimRequest(requestType, payload) {
              return new Promise((resolve, reject) => {
                  const id = messageIdCounter++;
                  messageCallbacks[id] = { resolve, reject };
                  self.postMessage({ type: 'request', id: id, requestType: requestType, payload: payload });
              });
          }

          self.LS_shim = {
              getArtifactContent: (id, cycle) => {
                  if (typeof id !== 'string' || typeof cycle !== 'number') {
                      return Promise.reject(new Error('Invalid arguments for getArtifactContent'));
                  }
                  return makeShimRequest('getArtifactContent', { id, cycle });
              },
          };

          self.StateManager_shim = {
              getArtifactMetadata: (id) => {
                  if (typeof id !== 'string') {
                      return Promise.reject(new Error('Invalid arguments for getArtifactMetadata'));
                  }
                  return makeShimRequest('getArtifactMetadata', { id });
              },
              getAllArtifactMetadata: () => {
                  return makeShimRequest('getAllArtifactMetadata', {});
              }
          };
        `;
        let worker = null;
        let timeoutId = null;
        let workerUrl = null;
        try {
          const blob = new Blob([workerCode], {
            type: "application/javascript",
          });
          workerUrl = URL.createObjectURL(blob);
          worker = new Worker(workerUrl);

          timeoutId = setTimeout(() => {
            const errorMsg = `Dynamic tool '${toolName}' timed out after ${DYNAMIC_TOOL_TIMEOUT_MS}ms.`;
            logger.logEvent("error", errorMsg);
            if (worker) worker.terminate();
            if (workerUrl) URL.revokeObjectURL(workerUrl);
            reject(
              new Error(`Dynamic tool '${toolName}' execution timed out.`)
            );
          }, DYNAMIC_TOOL_TIMEOUT_MS);

          worker.onmessage = async (event) => {
            const { type, success, result, error, id, requestType, payload } =
              event.data;

            if (type === "request") {
              try {
                let responseData = null;
                let responseError = null;
                switch (requestType) {
                  case "getArtifactContent":
                    responseData = Storage.getArtifactContent(
                      payload.id,
                      payload.cycle
                    );
                    break;
                  case "getArtifactMetadata":
                    responseData = StateManager.getArtifactMetadata(payload.id);
                    break;
                  case "getAllArtifactMetadata":
                    responseData = StateManager.getAllArtifactMetadata();
                    break;
                  default:
                    responseError = {
                      message: `Unknown request type: ${requestType}`,
                    };
                    logger.logEvent(
                      "warn",
                      `Worker requested unknown type: ${requestType}`
                    );
                }
                worker.postMessage({
                  type: "response",
                  id: id,
                  data: responseData,
                  error: responseError,
                });
              } catch (e) {
                logger.logEvent(
                  "error",
                  `Error handling worker request ${requestType}: ${e.message}`
                );
                worker.postMessage({
                  type: "response",
                  id: id,
                  data: null,
                  error: {
                    message: e.message || "Main thread error handling request",
                  },
                });
              }
            } else {
              clearTimeout(timeoutId);
              if (success) {
                logger.logEvent(
                  "info",
                  `Dynamic tool '${toolName}' execution succeeded.`
                );
                resolve(result);
              } else {
                const errorMsg = error?.message || "Unknown worker error";
                const errorStack = error?.stack || "(No stack trace)";
                logger.logEvent(
                  "error",
                  `Dynamic tool '${toolName}' execution failed in worker: ${errorMsg}\nStack: ${errorStack}`
                );
                reject(
                  new Error(`Dynamic tool '${toolName}' failed: ${errorMsg}`)
                );
              }
              if (workerUrl) URL.revokeObjectURL(workerUrl);
            }
          };

          worker.onerror = (error) => {
            clearTimeout(timeoutId);
            const errorMsg = error.message || "Unknown worker error";
            logger.logEvent(
              "error",
              `Web Worker error for tool '${toolName}': ${errorMsg}`,
              error
            );
            reject(
              new Error(
                `Worker error for dynamic tool '${toolName}': ${errorMsg}`
              )
            );
            if (workerUrl) URL.revokeObjectURL(workerUrl);
          };

          worker.postMessage({
            type: "init",
            payload: {
              toolCode: dynamicTool.implementation,
              toolArgs: toolArgs,
            },
          });
        } catch (e) {
          clearTimeout(timeoutId);
          logger.logEvent(
            "error",
            `Error setting up worker for '${toolName}': ${e.message}`
          );
          if (worker) worker.terminate();
          if (workerUrl) URL.revokeObjectURL(workerUrl);
          reject(
            new Error(
              `Failed to initialize worker for tool '${toolName}': ${e.message}`
            )
          );
        }
      });
    }

    throw new Error(`Tool not found: ${toolName}`);
  }

  return {
    runTool: runToolInternal,
  };
};
