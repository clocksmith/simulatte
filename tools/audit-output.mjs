import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Keep the CLI's current report location while retaining the complete previous run.
export async function prepareAuditOutput(directory, expectedSchemas) {
  const target = path.resolve(directory);
  if (target === path.parse(target).root) throw new Error('Audit output cannot be a filesystem root');
  const info = await fs.lstat(target).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  let previousOutput = null;
  if (info) {
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Audit output must be a real directory');
    const entries = await fs.readdir(target);
    if (entries.length) {
      let recognized = false;
      for (const name of ['report.json', 'failure.json']) {
        if (!entries.includes(name)) continue;
        const receipt = JSON.parse(await fs.readFile(path.join(target, name), 'utf8'));
        if (expectedSchemas.includes(receipt.schema)) recognized = true;
      }
      if (!recognized) throw new Error(`Audit output contains unrecognized files; use a fresh --out directory: ${target}`);
      previousOutput = `${target}.previous-${randomUUID()}`;
      await fs.rename(target, previousOutput);
    }
  }
  await fs.mkdir(target, { recursive: true });
  return previousOutput;
}
