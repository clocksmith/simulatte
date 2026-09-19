export interface RunContext {
  readonly runId: number;
  readonly signal: AbortSignal;
}

export interface Plugin {
  readonly id: string;
  /** Throw or return false to reject. Async validation is awaited. */
  validateInput(input: unknown): unknown | Promise<unknown>;
  run(input: unknown, context: RunContext): unknown | Promise<unknown>;
  validateOutput(output: unknown): unknown | Promise<unknown>;
}

export interface Progress {
  readonly runId: number;
  readonly stageId: string;
  readonly status: 'running' | 'completed' | 'failed';
  readonly completed?: number;
  readonly total?: number;
  readonly code?: string;
  readonly message?: string;
}

export interface Ports {
  /** Synchronous observation only; a thrown error fails the run. */
  onProgress(progress: Progress): void;
  /** The host chooses scheduling. This is not a simulation clock. */
  yieldTask(context: RunContext): void | Promise<void>;
}

export interface Artifact {
  readonly stageId: string;
  readonly output: unknown;
}

export interface RunResult {
  readonly runId: number;
  readonly output: unknown;
  readonly artifacts: readonly Artifact[];
}

export interface RunFailure extends Error {
  readonly code: string;
  readonly stageId?: string;
  readonly artifacts?: readonly Artifact[];
}

export interface Runtime {
  /** A valid new run supersedes the previous run on this instance only. */
  run(input: unknown, plugins: readonly Plugin[], options?: { signal?: AbortSignal }): Promise<RunResult>;
  cancel(reason?: unknown): void;
  /** Abort, reject new runs, and drain outstanding plugin promises. Idempotent. */
  close(): Promise<void>;
}

export function createRuntime(options: { ports: Ports }): Runtime;
