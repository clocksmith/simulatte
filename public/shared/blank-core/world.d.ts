export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface WorldSpec {
  schema: 'simulatte.worldSpec.v1';
  schemaVersion: string;
  contentHash: string;
  id: string;
  templateId: string;
  name: string;
  kind: string;
  description: string;
  modules: JsonValue[];
  objects: JsonValue[];
  controls: JsonValue[];
  params: { [key: string]: JsonValue };
  source: { [key: string]: JsonValue };
  authorship: { [key: string]: JsonValue };
  determinism: { [key: string]: JsonValue };
  dependencies: { [key: string]: JsonValue };
  safety: { [key: string]: JsonValue };
  unsupportedRequirements: JsonValue[];
  unresolvedAmbiguities: JsonValue[];
  [key: string]: JsonValue;
}
/** The packaged JSON schema and runtime validator define the complete field contract. */
export function parseWorldSpec(text: string, options?: Record<string, unknown>): WorldSpec;
export function validateWorldSpec(value: unknown, options?: Record<string, unknown>): unknown;
export function serializeWorldSpec(spec: WorldSpec): string;
export function editWorldSpec(current: WorldSpec, candidate: string | WorldSpec, options?: { rationale?: string }): WorldSpec;
export const worldSpecSchemaURL: string;
