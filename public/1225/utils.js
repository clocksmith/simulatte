const Utils = (() => {
  let cfg = null;
  let log_buf = [];
  let log_idx = 0;
  let log_ok = false;

  const MAX_LOG = () => cfg?.logMax || 1000;

  const init_log = (config) => {
    cfg = config;
    log_buf = new Array(MAX_LOG()).fill(null);
    log_idx = 0;
    log_buf[log_idx++] = `DTF Log Start - ${new Date().toISOString()}\n=================\n`;
    log_ok = true;
  };

  const stringify = (detail, indent = 0) => {
     const space = ' '.repeat(indent);
     if (detail === undefined) return `${space}undefined`;
     if (detail === null) return `${space}null`;
     if (typeof detail === 'string') return `${space}"${detail}"`; // Keep strings quoted for clarity
     if (typeof detail === 'number' || typeof detail === 'boolean') return `${space}${detail}`;
     if (detail instanceof Error) return `${space}Error: ${detail.message}${detail.stack ? `\n${space} Stack: ${detail.stack}` : ''}`;
     try {
        // Pretty print JSON-like objects
        return JSON.stringify(detail, (k, v) => typeof v === 'bigint' ? v.toString() + 'n' : v, 2);
     } catch (e) { return `${space}[Unserializable]`; }
  };

  const logger = {
    init: init_log,
    logEvent: (lvl = 'info', msg = '[No Msg]', ...details) => {
      if (!log_ok) { console.warn('Logger not init'); init_log(cfg || {}); } // Use passed cfg or empty obj
      const ts = new Date().toISOString();
      const lvl_up = String(lvl).toUpperCase();
      let line = `[${ts}] [${lvl_up}] ${String(msg)}`;
      // Use stringify for better object formatting in logs
      const detail_str = details.map(d => stringify(d)).join(' | ');
      if (detail_str && detail_str.trim() !== 'undefined' && detail_str.trim() !== 'null') {
          line += ` | ${detail_str}`;
      }

      const max = MAX_LOG();
      log_buf[log_idx % max] = line;
      log_idx++;

      const method = lvl?.toLowerCase() === 'error' ? console.error
                     : lvl?.toLowerCase() === 'warn' ? console.warn
                     : lvl?.toLowerCase() === 'debug' ? console.debug
                     : console.log;
      method(line); // Log raw line to console
    },
    getLogBuffer: () => {
      if (!log_ok) return 'Log buffer not init.\n';
      const max = MAX_LOG();
      const size = Math.min(log_idx, max);
      const start = log_idx <= max ? 0 : log_idx % max;
      const lines = [];
      for (let i = 0; i < size; i++) {
        const idx = (start + i) % max;
        if (log_buf[idx] !== null) lines.push(log_buf[idx]);
      }
      let content = lines.join('\n') + '\n';
      if (log_idx > max) content = `... (Log truncated - last ${max} entries) ...\n` + content;
      return content;
    },
    // Convenience methods
    debug: (...args) => logger.logEvent('debug', ...args),
    info: (...args) => logger.logEvent('info', ...args),
    warn: (...args) => logger.logEvent('warn', ...args),
    error: (...args) => logger.logEvent('error', ...args),
  };

  const id = (element_id) => document.getElementById(element_id);
  const qs = (selector, parent = document) => parent.querySelector(selector);
  const qsa = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

  const escape = (unsafe) => String(unsafe ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const uuid = () => crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

   const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

   const download = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      // Timeout needed for Firefox
      setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }, 100);
   };
   const downloadText = (text, filename) => download(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
   const downloadJson = (obj, filename) => download(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);


  return { logger, id, qs, qsa, escape, delay, uuid, stringify, timestamp, downloadText, downloadJson };
})();
export default Utils;

