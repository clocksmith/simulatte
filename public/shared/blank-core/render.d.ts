export type RenderOperation = 'setScene' | 'render' | 'resize' | 'setCamera' | 'pick' | 'capture' | 'receipt';
export type RenderAdapter = Partial<Record<RenderOperation, (...args: unknown[]) => unknown>> & {
  render(...args: unknown[]): unknown;
  receipt(...args: unknown[]): unknown;
  dispose(): void | Promise<void>;
};
export interface RendererSession extends Record<RenderOperation, (...args: unknown[]) => unknown> {
  readonly backend: string;
  readonly capabilities: Readonly<Record<RenderOperation, boolean>>;
  readonly ready: Promise<RendererSession>;
  status(): Readonly<{ state: string; backend: string; error: { code: string; message: string } | null }>;
  close(): Promise<void>;
}
export function createRendererSession(options: {
  backend: string;
  initialize(context: { signal: AbortSignal; fail(error: unknown): void }): RenderAdapter | Promise<RenderAdapter>;
  capabilities: readonly RenderOperation[];
  signal?: AbortSignal;
  onError?: (error: Error) => void;
}): RendererSession;
