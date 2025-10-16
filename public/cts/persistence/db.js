const STORAGE_KEY = 'cts-scenarios-v1';
const STORAGE_KEY_BACKUP = 'cts-scenarios-v1-backup';

export async function loadDatabase() {
  return true;
}

export function loadSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Validate the structure
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[CTS] Invalid snapshot structure, clearing');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (!parsed.scenarios || typeof parsed.scenarios !== 'object') {
      console.warn('[CTS] Missing scenarios object, clearing');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('[CTS] Failed to load snapshot, attempting backup', error);

    // Try to load backup
    try {
      const backup = localStorage.getItem(STORAGE_KEY_BACKUP);
      if (backup) {
        const parsed = JSON.parse(backup);
        console.info('[CTS] Restored from backup');
        return parsed;
      }
    } catch (backupError) {
      console.error('[CTS] Backup also corrupted', backupError);
    }

    // Clear corrupted data
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_BACKUP);
    return null;
  }
}

export function saveSnapshot(snapshot) {
  try {
    // Validate before saving
    if (!snapshot || !snapshot.scenarios) {
      console.warn('[CTS] Refusing to save invalid snapshot');
      return;
    }

    const serialized = JSON.stringify(snapshot);

    // Keep a backup of the previous state
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      try {
        localStorage.setItem(STORAGE_KEY_BACKUP, current);
      } catch (backupError) {
        // Ignore backup errors, but log them
        console.warn('[CTS] Could not save backup', backupError);
      }
    }

    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.error('[CTS] Failed to persist snapshot', error);

    // If quota exceeded, try to clean up old backup
    if (error.name === 'QuotaExceededError') {
      try {
        localStorage.removeItem(STORAGE_KEY_BACKUP);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        console.info('[CTS] Saved after removing backup');
      } catch (retryError) {
        console.error('[CTS] Still cannot save even after cleanup', retryError);
      }
    }
  }
}
