import { stopChild, removeLegacyProfile } from './browser-session.mjs';

async function removeGeneratedProfileDirectory(directory) {
  try { return await removeLegacyProfile(directory, 'simulatte-profile-evidence-'); }
  catch (error) {
    if (error.message.startsWith('Browser cleanup target invalid:')) {
      throw new Error(`profile_evidence_cleanup_target_invalid: ${directory}`, { cause: error });
    }
    return { removed: false, path: directory, error: error.message };
  }
}

export { removeGeneratedProfileDirectory, stopChild };
