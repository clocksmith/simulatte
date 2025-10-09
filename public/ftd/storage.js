const Storage = (cfg, log) => {
  const PREFIX = cfg.storePrefix;
  const STATE_KEY = cfg.stateKey; // Use the specific state key from config
  const MAX_SIZE = cfg.artifactMaxBytes;
  const QUOTA = cfg.storeQuotaBytes;
  const WARN = cfg.storeQuotaWarn;

  const usage = () => {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(PREFIX) || k === STATE_KEY)) {
          bytes += (localStorage.getItem(k)?.length ?? 0) * 2; // UTF-16
        }
      }
      const pct = QUOTA > 0 ? (bytes / QUOTA) * 100 : 0;
      return { used: bytes, quota: QUOTA, pct };
    } catch (e) {
      log.error('Failed storage usage calc', e);
      return { used: -1, quota: QUOTA, pct: -1 };
    }
  };

  const check_quota = (key, value) => {
    const current = usage();
    const new_size = (value?.length ?? 0) * 2;
    const old_size = (localStorage.getItem(key)?.length ?? 0) * 2;
    const estimated = current.used - old_size + new_size;

    if (current.used >= 0 && QUOTA > 0 && estimated / QUOTA > WARN) {
      log.warn(`Storage usage high (${((estimated / QUOTA) * 100).toFixed(1)}%) after setting: ${key}`);
    }
    if (current.used >= 0 && QUOTA > 0 && estimated > QUOTA) {
      log.error(`Storage quota exceeded estimate for key: ${key}. Usage: ${(estimated / 1024 / 1024).toFixed(2)}MB`);
      // Let setItem fail naturally, but log error
    }
  };

  const get_item = (key) => {
    try { return localStorage.getItem(key); }
    catch (e) { log.error(`LS GET Error: ${key}`, e); return null; }
  };

  const set_item = (key, value) => {
    if (typeof value !== 'string') throw new Error(`Invalid LS value type: ${typeof value}`);
    if (value.length * 2 > MAX_SIZE) throw new Error(`Value exceeds size limit (${value.length * 2} > ${MAX_SIZE} bytes) for key: ${key}`);
    check_quota(key, value);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      let msg = `LS SET Error: ${key}`;
      if (e.name === 'QuotaExceededError' || (e.code && (e.code === 22 || e.code === 1014))) {
        const u = usage();
        msg = `LS Quota Exceeded for key: ${key}. Usage: ${(u.used / 1024 / 1024).toFixed(2)}MB / ${(QUOTA / 1024 / 1024).toFixed(2)}MB.`;
        log.error(msg, e);
        throw new Error(msg);
      } else {
        log.error(msg, e);
        throw e;
      }
    }
  };

  const remove_item = (key) => {
    try { localStorage.removeItem(key); return true; }
    catch (e) { log.error(`LS REMOVE Error: ${key}`, e); return false; }
  };

  // Artifact key now includes the type (e.g., .mcp.json, .impl.js, .wc.js)
  const artifact_key = (id_with_type) => {
    if (!id_with_type || typeof id_with_type !== 'string') throw new Error(`Invalid artifact ID: ${id_with_type}`);
    // Basic sanitization, applied *after* splitting type if needed, or assume ID is safe
    const clean_id = id_with_type.replace(/[:/\\?#%]/g, '_');
    return `${PREFIX}art:${clean_id}`;
  };

  const get_artifact = (id_with_type) => get_item(artifact_key(id_with_type));
  const set_artifact = (id_with_type, content) => set_item(artifact_key(id_with_type), content);
  const delete_artifact = (id_with_type) => remove_item(artifact_key(id_with_type));

  const list_artifact_keys = () => {
    const keys = [];
    const art_prefix = `${PREFIX}art:`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(art_prefix)) keys.push(k);
      }
    } catch (e) { log.error('Failed listing artifact keys', e); }
    return keys;
  };

  const get_state = () => {
    const json = get_item(STATE_KEY); // Use specific state key
    if (!json) return null;
    try { return JSON.parse(json); }
    catch (e) {
      log.error(`Failed state parse: ${e.message}. Removing invalid state.`);
      remove_item(STATE_KEY);
      return null;
    }
  };

  const save_state = (state_obj) => {
    if (!state_obj || typeof state_obj !== 'object') throw new Error('Invalid state obj');
    try {
      const state_str = JSON.stringify(state_obj);
      return set_item(STATE_KEY, state_str); // Use specific state key
    } catch (e) {
      log.error('Failed save state', e);
      if (e.message.includes('Quota Exceeded')) throw e;
      throw new Error(`State save fail: ${e.message}`);
    }
  };

  const remove_state = () => remove_item(STATE_KEY); // Use specific state key

  const clear_all = () => {
    log.warn('Clearing all DTF data from localStorage and sessionStorage.');
    let removed = 0;
    const keys_to_remove = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // Check for prefix OR the specific state key
        if (k && (k.startsWith(PREFIX) || k === STATE_KEY)) {
          keys_to_remove.push(k);
        }
      }
      keys_to_remove.forEach(k => { if (remove_item(k)) removed++; });
      log.info(`Removed ${removed} LS keys.`);
      sessionStorage.clear(); // Clear session storage too
      log.info('Cleared sessionStorage.');
    } catch (e) { log.error('Error during clear_all', e); }
    return removed;
  };

  return {
    usage, get_artifact, set_artifact, delete_artifact, list_artifact_keys,
    get_state, save_state, remove_state, clear_all,
  };
};
export default Storage;

