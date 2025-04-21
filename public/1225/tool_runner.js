const ToolRunner = (cfg, log) => {
  const TIMEOUT = cfg.runTimeoutMs;

  const run_js = async (code, args) => {
    log.info('Attempting JS execution.');
    log.debug('Code:', code.substring(0, 100) + '...');
    log.debug('Args:', args);

    if (typeof code !== 'string' || !code.trim()) {
      throw new Error('JS code string is empty/invalid.');
    }
    // Check might be too strict if LLM uses different patterns
    // if (!code.includes('async function run') && !code.includes('run = async')) {
    //   log.warn("JS code missing typical 'async function run(args)' structure.");
    // }

    return new Promise(async (resolve, reject) => {
      let timeout_id = null;
      try {
        const AsyncFunc = Object.getPrototypeOf(async function(){}).constructor;
        const safe_console = {
          log: (...a) => log.info('Tool Log:', ...a),
          warn: (...a) => log.warn('Tool Warn:', ...a),
          error: (...a) => log.error('Tool Error:', ...a),
        };
        // Ensure 'run' is defined and callable
        const func_body = `
          ${code}
          if (typeof run !== 'function') {
            throw new Error("'run' function not defined in provided code.");
          }
          return run(args);
        `;
        const func = new AsyncFunc('args', 'console', func_body);

        timeout_id = setTimeout(() => reject(new Error(`Tool exec timeout (${TIMEOUT}ms)`)), TIMEOUT);

        const result = await func(args, safe_console);
        clearTimeout(timeout_id);
        log.info('Tool execution complete.');
        log.debug('Result:', result);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout_id);
        log.error('JS execution error:', error);
        reject(new Error(`Tool exec failed: ${error.message}`));
      }
    });
  };

  return { run_js };
};
export default ToolRunner;

