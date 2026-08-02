import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  child.once('exit', resolveExit);
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  if (stopped || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await exited;
}

async function removeGeneratedProfileDirectory(profileDirectory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(profileDirectory);
  if (
    path.dirname(resolved) !== temporaryRoot
    || !path.basename(resolved).startsWith('simulatte-profile-evidence-')
  ) throw new Error(`profile_evidence_cleanup_target_invalid: ${resolved}`);
  const quarantine = `${resolved}-cleanup-${process.pid}-${Date.now()}`;
  let target = resolved;
  try {
    fs.renameSync(resolved, quarantine);
    target = quarantine;
  } catch (error) {
    if (error.code === 'ENOENT') return { removed: true, path: resolved };
  }
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
      return { removed: true, path: target };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return { removed: false, path: target, error: lastError?.message || 'unknown cleanup error' };
}

export { removeGeneratedProfileDirectory, stopChild };
