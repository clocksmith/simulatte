import type { Progress } from './index.js';
import type { WorldSpec } from './world.js';

export interface InputIdentity {
  name: string;
  sha256: string;
  byteLength: number;
  [key: string]: unknown;
}
export interface TableInput {
  kind: 'table';
  columns: string[];
  rows: Record<string, unknown>[];
  source: InputIdentity;
}
export interface Point {
  id: string;
  label: string;
  x: number;
  y: number;
}
export interface Frame {
  schema: 'simulatte.pointScene.v1';
  programHash: string;
  step: number;
  time: number;
  units: string;
  points: Point[];
}
export interface DataRun {
  schema: 'simulatte.pointMotionRun.v1';
  programHash: string;
  frames: Frame[];
  receipt: {
    schema: 'simulatte.dataRunReceipt.v1';
    programSha256: string;
    outputSha256: string;
    scientificValidation: 'not-performed';
    visualRecognition: 'not-reviewed';
    [key: string]: unknown;
  };
}
export function decodeInput(text: string, options?: { name?: string; origin?: string; signal?: AbortSignal }): Promise<
  TableInput | { kind: 'worldSpec'; spec: WorldSpec; source: InputIdentity } | { kind: 'legacySpec'; [key: string]: unknown }
>;
export function compileDataWorld(input: TableInput, options: {
  mapping: Record<'id' | 'label' | 'x' | 'y' | 'vx' | 'vy', string | null>;
  duration: number;
  steps: number;
  units: string;
}): WorldSpec;
export function createDataSimulation(options?: {
  onProgress?: (progress: Progress) => void;
  yieldTask?: () => void | Promise<void>;
}): { run(spec: WorldSpec): Promise<DataRun>; cancel(): void; close(): Promise<void> };
export function compareDataRuns(before: DataRun, after: DataRun): {
  schema: 'simulatte.dataRunComparison.v1';
  before: DataRun['receipt'];
  after: DataRun['receipt'];
  sameProgram: boolean;
  sameOutput: boolean;
  added: number;
  removed: number;
  changed: number;
};
