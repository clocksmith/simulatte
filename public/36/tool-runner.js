const ToolRunnerModule = (config, logger) => {
  if (!config || !logger) {
    console.error("ToolRunnerModule requires config and logger.");
    return null;
  }

  const EXECUTION_TIMEOUT_MS = config.toolRunnerTimeoutMs || 10000;

  const runJsImplementation = async (jsCodeString, args) => {
    logger.logEvent(
      "info",
      `Attempting to execute generated JS implementation.`
    );
    logger.logEvent(
      "debug",
      `Executing code:`,
      jsCodeString.substring(0, 200) + "..."
    );
    logger.logEvent("debug", `With arguments:`, args);

    if (typeof jsCodeString !== "string" || jsCodeString.trim() === "") {
      throw new Error("Provided JS code string is empty or invalid.");
    }

    if (
      !jsCodeString.includes("async function run") &&
      !jsCodeString.includes("run = async")
    ) {
      logger.logEvent(
        "warn",
        "Generated JS code might be missing expected 'async function run(args)' structure."
      );
    }

    return new Promise(async (resolve, reject) => {
      let timeoutId = null;
      try {
        const AsyncFunction = Object.getPrototypeOf(
          async function () {}
        ).constructor;

        const restrictedConsole = {
          log: (...logArgs) => logger.logEvent("info", "Tool Log:", ...logArgs),
          warn: (...logArgs) =>
            logger.logEvent("warn", "Tool Warn:", ...logArgs),
          error: (...logArgs) =>
            logger.logEvent("error", "Tool Error:", ...logArgs),
        };

        const func = new AsyncFunction(
          "args",
          "console",
          jsCodeString + "\n\nreturn run(args);"
        );

        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Tool execution timed out after ${EXECUTION_TIMEOUT_MS}ms`
            )
          );
        }, EXECUTION_TIMEOUT_MS);

        const result = await func(args, restrictedConsole);
        clearTimeout(timeoutId);
        logger.logEvent("info", "Tool execution completed successfully.");
        logger.logEvent("debug", "Tool result:", result);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        logger.logEvent("error", "Error executing generated JS code:", error);
        reject(new Error(`Tool execution failed: ${error.message}`));
      }
    });
  };

  return {
    runJsImplementation,
  };
};

export default ToolRunnerModule;
