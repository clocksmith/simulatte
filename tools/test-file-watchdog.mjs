import { spawn } from 'node:child_process';

export function runCommandWithWatchdog({
  command,
  args = [],
  cwd,
  env = process.env,
  stallTimeoutMs,
  terminationGraceMs,
  onOutput = null,
}) {
  if (!Number.isFinite(stallTimeoutMs) || stallTimeoutMs <= 0) {
    throw new Error('test process watchdog requires a positive stallTimeoutMs');
  }
  if (!Number.isFinite(terminationGraceMs) || terminationGraceMs < 0) {
    throw new Error('test process watchdog requires a nonnegative terminationGraceMs');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const startedAt = Date.now();
    const output = [];
    let stalled = false;
    let killTimer = null;
    let stallTimer = null;

    const armWatchdog = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), terminationGraceMs);
      }, stallTimeoutMs);
    };
    const capture = (stream, chunk) => {
      const text = chunk.toString();
      output.push({ stream, text });
      armWatchdog();
      if (typeof onOutput === 'function') onOutput({ stream, text });
    };

    child.stdout.on('data', (chunk) => capture('stdout', chunk));
    child.stderr.on('data', (chunk) => capture('stderr', chunk));
    child.once('error', (error) => {
      clearTimeout(stallTimer);
      clearTimeout(killTimer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(stallTimer);
      clearTimeout(killTimer);
      resolve({
        status: stalled ? 'stalled' : code === 0 ? 'passed' : 'failed',
        code,
        signal,
        durationMs: Date.now() - startedAt,
        stdout: output.filter((row) => row.stream === 'stdout').map((row) => row.text).join(''),
        stderr: output.filter((row) => row.stream === 'stderr').map((row) => row.text).join(''),
      });
    });
    armWatchdog();
  });
}

export function runTestFileWithWatchdog(file, options) {
  return runCommandWithWatchdog({
    command: process.execPath,
    args: ['--test', file],
    ...options,
  });
}
