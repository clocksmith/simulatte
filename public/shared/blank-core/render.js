import createRendererApi from './factories/renderer-session.js';

const renderers = createRendererApi();

export function createRendererSession(options) {
  const inner = renderers.create(options);
  const { ready, dispose, ...operations } = inner;
  const session = Object.freeze({
    ...operations,
    ready: ready.then(() => session),
    close: dispose,
  });
  // Preserve the existing lifecycle: callers may inspect status before awaiting readiness.
  session.ready.catch(() => {});
  return session;
}
