import type { JsonValue } from './world.js';

export type PhaseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Envelope = Readonly<Record<string, JsonValue>>;
export interface PhaseCall {
  readonly previous: Envelope;
  readonly invocation: Envelope;
}
export interface ResourceDescriptor {
  readonly id: string;
  readonly kind: string;
  readonly residentBytes: number;
  readonly contentDigest?: string;
  readonly [key: string]: JsonValue | undefined;
}
export interface Resource {
  readonly descriptor: ResourceDescriptor;
  readonly handle: unknown;
  acquire?(signal: AbortSignal): (() => void | Promise<void>) | Promise<() => void | Promise<void>>;
}
export interface Phase {
  readonly phase: PhaseNumber;
  readonly resourceIds: readonly string[];
  validateInput(call: PhaseCall, dependencies: readonly ResourceDescriptor[]): unknown | Promise<unknown>;
  run(call: PhaseCall, resources: Readonly<Record<string, unknown>>, signal: AbortSignal): Envelope | Promise<Envelope>;
  validateOutput(output: Envelope, call: PhaseCall): unknown | Promise<unknown>;
}
export interface Policy {
  readonly schema: 'simulatte.phaseRunPolicy.v1';
  readonly id: string;
  readonly maxInputBytes: number;
  readonly maxEvidenceBytes: number;
  readonly phases: readonly {
    readonly phase: PhaseNumber;
    readonly maxDurationMs: number;
    readonly maxArtifactBytes: number;
    readonly maxResidentBytes: number;
  }[];
}
export interface Compiler {
  run(request: Envelope, options?: {
    resources?: Readonly<Record<string, Resource>>;
    invocationForPhase?: (phase: PhaseNumber, previous: Envelope, signal: AbortSignal) => Envelope | Promise<Envelope>;
    signal?: AbortSignal;
  }): Promise<readonly Envelope[]>;
  cancel(message?: string): void;
  close(): Promise<void>;
}
export function createCompiler(options: {
  phases: readonly Phase[];
  policy: Policy;
  producer: Envelope;
  onPublish?: (output: Envelope) => void;
  onAttempt?: (attempt: Readonly<Record<string, unknown>>) => void;
}): Compiler;
export const compilerContract: Readonly<{
  schema: string;
  version: string;
  requestSchema: string;
  envelope: Readonly<Record<string, unknown>>;
  phases: readonly Readonly<Record<string, unknown>>[];
}>;
