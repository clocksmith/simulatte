const ToolRunner = (cfg, log) => {
  const TIMEOUT = cfg.runTimeoutMs;

  // Dangerous patterns that could indicate malicious code
  const DANGEROUS_PATTERNS = [
    /\beval\s*\(/i,                    // eval() calls
    /\bFunction\s*\(/i,               // Function constructor (bypassing sandbox)
    /\bimport\s*\(/i,                 // Dynamic imports
    /\brequire\s*\(/i,                // CommonJS require
    /\bfetch\s*\(/i,                  // Network requests
    /\bXMLHttpRequest\b/i,            // XHR requests
    /\bWebSocket\b/i,                 // WebSocket connections
    /\blocalStorage\b/i,              // LocalStorage access
    /\bsessionStorage\b/i,            // SessionStorage access
    /\bindexedDB\b/i,                 // IndexedDB access
    /\bdocument\.cookie\b/i,          // Cookie access
    /\bwindow\.(open|location)\b/i,   // Window manipulation
    /\blocation\.(href|assign|replace)\b/i,  // Navigation
    /\bhistory\.(pushState|replaceState)\b/i, // History manipulation
    /\bpostMessage\b/i,               // Cross-origin messaging
    /\b__proto__\b/i,                 // Prototype pollution
    /\bconstructor\s*\[/i,            // Constructor access
    /\bprocess\./i,                   // Node.js process object
    /\bglobal\./i,                    // Node.js global object
  ];

  // Check code for dangerous patterns
  const check_code_safety = (code) => {
    const issues = [];
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        issues.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    }
    return issues;
  };

  const run_js = async (code, args) => {
    log.info('Attempting JS execution.');
    log.debug('Code:', code.substring(0, 100) + '...');
    log.debug('Args:', args);

    if (typeof code !== 'string' || !code.trim()) {
      throw new Error('JS code string is empty/invalid.');
    }

    // Check for dangerous patterns
    const safety_issues = check_code_safety(code);
    if (safety_issues.length > 0) {
      log.warn('Code safety check found issues:', safety_issues);
      // Log but don't block - the sandbox should contain it
      // If we want to block, uncomment the following:
      // throw new Error(`Code safety check failed: ${safety_issues.join(', ')}`);
    }

    return new Promise(async (resolve, reject) => {
      let timeout_id = null;
      try {
        const AsyncFunc = Object.getPrototypeOf(async function(){}).constructor;

        // Create a restricted console that only allows logging
        const safe_console = {
          log: (...a) => log.info('Tool Log:', ...a),
          warn: (...a) => log.warn('Tool Warn:', ...a),
          error: (...a) => log.error('Tool Error:', ...a),
          info: (...a) => log.info('Tool Info:', ...a),
          debug: (...a) => log.debug('Tool Debug:', ...a),
        };

        // Create frozen/restricted versions of potentially dangerous globals
        const restricted_globals = Object.freeze({
          fetch: undefined,
          XMLHttpRequest: undefined,
          WebSocket: undefined,
          localStorage: undefined,
          sessionStorage: undefined,
          indexedDB: undefined,
          document: Object.freeze({
            // Allow safe document methods only
            createElement: () => { throw new Error('DOM access not allowed in tool sandbox'); },
            getElementById: () => { throw new Error('DOM access not allowed in tool sandbox'); },
            querySelector: () => { throw new Error('DOM access not allowed in tool sandbox'); },
          }),
          window: undefined,
          location: undefined,
          history: undefined,
          navigator: undefined,
          eval: undefined,
          Function: undefined,
        });

        // Ensure 'run' is defined and callable
        const func_body = `
          // Sandbox: restrict dangerous globals
          const { fetch, XMLHttpRequest, WebSocket, localStorage, sessionStorage, indexedDB, eval, Function } = _restricted_;
          ${code}
          if (typeof run !== 'function') {
            throw new Error("'run' function not defined in provided code.");
          }
          return run(args);
        `;
        const func = new AsyncFunc('args', 'console', '_restricted_', func_body);

        timeout_id = setTimeout(() => reject(new Error(`Tool exec timeout (${TIMEOUT}ms)`)), TIMEOUT);

        const result = await func(args, safe_console, restricted_globals);
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

  return { run_js, check_code_safety };
};
export default ToolRunner;

