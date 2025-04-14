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
  const LS_PREFIX = config.LS_PREFIX; // Needed for worker shim localStorage key construction

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
        if (artifactContent === null) {
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
            } else if (
              toolArgs.language === "html" &&
              code.includes("<script") &&
              !code.includes("</script>")
            ) {
              hasError = true;
              errorMessage = "Potentially unclosed script tag.";
            } else if (
              toolArgs.language === "javascript" &&
              ((code.match(/{/g) || []).length !==
                (code.match(/}/g) || []).length ||
                (code.match(/\(/g) || []).length !==
                  (code.match(/\)/g) || []).length)
            ) {
              hasError = true;
              errorMessage = "Mismatched braces or parentheses.";
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
          };

        case "json_validator":
          try {
            JSON.parse(artifactContent);
            return { result: "JSON structure is valid.", valid: true };
          } catch (e) {
            return { result: `JSON invalid: ${e.message}`, valid: false };
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
          } else if (meta && meta.type === "HTML") {
            if (
              newContent.includes("<script") &&
              !newContent.includes("</script>")
            ) {
              isValid = false;
              validationError =
                "Potentially unclosed script tag detected in HTML.";
            }
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
        // Worker code now uses LS_PREFIX passed via config
        const workerCode = `
                const LS_PREFIX = "${LS_PREFIX}"; // Use prefix from config

                self.LS_shim = {
                   getArtifactContent: (id, cycle) => self.localStorage.getItem(\`\${LS_PREFIX}\${id}_\${cycle}\`),
                };

                self.StateManager_shim = {
                    getArtifactMetadata: (id) => {
                       console.warn('StateManager_shim.getArtifactMetadata called, but not fully implemented in worker.');
                       return { id: id, type: 'UNKNOWN', latestCycle: -1};
                    },
                    getAllArtifactMetadata: () => {
                         console.warn('StateManager_shim.getAllArtifactMetadata called, but not fully implemented in worker.');
                         return {};
                    }
                };

                self.onmessage = async (event) => {
                    const { toolCode, toolArgs } = event.data;
                    try {
                        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                        // Inject shims into the dynamic function
                        const func = new AsyncFunction('params', 'LS', 'StateManager', toolCode + '\\n\\nreturn await run(params);');
                        const result = await func(toolArgs, self.LS_shim, self.StateManager_shim);
                        self.postMessage({ success: true, result: result });
                    } catch (e) {
                         // Include stack trace if available
                         const errorMsg = e.stack ? e.stack : e.message;
                         self.postMessage({ success: false, error: errorMsg });
                    } finally {
                        self.close();
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
            logger.logEvent(
              "error",
              `Dynamic tool '${toolName}' timed out after ${DYNAMIC_TOOL_TIMEOUT_MS}ms.`
            );
            if (worker) worker.terminate();
            if (workerUrl) URL.revokeObjectURL(workerUrl);
            reject(
              new Error(`Dynamic tool '${toolName}' execution timed out.`)
            );
          }, DYNAMIC_TOOL_TIMEOUT_MS);
          worker.onmessage = (event) => {
            clearTimeout(timeoutId);
            if (event.data.success) {
              logger.logEvent(
                "info",
                `Dynamic tool '${toolName}' execution succeeded.`
              );
              resolve(event.data.result); // Resolve directly with the result
            } else {
              logger.logEvent(
                "error",
                `Dynamic tool '${toolName}' execution failed in worker: ${event.data.error}`
              );
              reject(
                new Error(
                  `Dynamic tool '${toolName}' failed: ${event.data.error}`
                )
              );
            }
            if (workerUrl) URL.revokeObjectURL(workerUrl);
          };
          worker.onerror = (error) => {
            clearTimeout(timeoutId);
            logger.logEvent(
              "error",
              `Web Worker error for tool '${toolName}': ${error.message}`,
              error
            );
            reject(
              new Error(
                `Worker error for dynamic tool '${toolName}': ${error.message}`
              )
            );
            if (workerUrl) URL.revokeObjectURL(workerUrl);
          };
          worker.postMessage({
            toolCode: dynamicTool.implementation,
            toolArgs: toolArgs,
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
