import { failure, snapshotPlugins, snapshotPorts, validate } from './contracts.js';

// Application policy supplies the ordered plugins; this layer owns only execution.
export function createRuntime({ ports } = {}) {
  const host = snapshotPorts(ports);
  const pending = new Set();
  let current = null;
  let serial = 0;
  let closed = false;
  let closing = null;

  function cancel(reason) {
    const scope = current;
    current = null;
    scope?.controller.abort(reason);
  }

  function run(input, plugins, { signal } = {}) {
    if (closed) return Promise.reject(failure('pipeline_closed', 'Runtime is closed'));
    let steps;
    try { steps = snapshotPlugins(plugins); }
    catch (error) { return Promise.reject(error); }
    cancel();
    const controller = new AbortController();
    const scope = { controller, runId: ++serial };
    current = scope;
    const context = Object.freeze({ runId: scope.runId, signal: controller.signal });
    const artifacts = [];
    let stageId = '';
    const cancellation = () => Object.assign(
      failure('pipeline_cancelled', 'Pipeline cancelled or superseded', controller.signal.reason),
      { stageId, artifacts: Object.freeze([...artifacts]) }
    );
    const assertCurrent = () => {
      if (current !== scope || controller.signal.aborted || closed) throw cancellation();
    };
    const forwardAbort = () => {
      if (current === scope) current = null;
      controller.abort(signal.reason);
    };
    let rejectAbort;
    const interrupted = new Promise((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(cancellation());
    controller.signal.addEventListener('abort', onAbort, { once: true });
    signal?.addEventListener('abort', forwardAbort, { once: true });
    if (signal?.aborted) forwardAbort();

    const work = (async () => {
      try {
        let output = input;
        for (let index = 0; index < steps.length; index += 1) {
          assertCurrent();
          const plugin = steps[index];
          stageId = plugin.id;
          await validate(plugin, 'validateInput', output);
          assertCurrent();
          host.onProgress(Object.freeze({ runId: scope.runId, stageId, status: 'running', completed: index, total: steps.length }));
          assertCurrent();
          await host.yieldTask(context);
          assertCurrent();
          output = await plugin.run(output, context);
          assertCurrent();
          await validate(plugin, 'validateOutput', output);
          assertCurrent();
          artifacts.push(Object.freeze({ stageId, output }));
        }
        host.onProgress(Object.freeze({ runId: scope.runId, stageId, status: 'completed', completed: steps.length, total: steps.length }));
        assertCurrent();
        return Object.freeze({ runId: scope.runId, output, artifacts: Object.freeze(artifacts) });
      } catch (cause) {
        const error = failure(
          typeof cause?.code === 'string' ? cause.code : 'pipeline_stage_failed',
          cause instanceof Error ? cause.message : String(cause),
          cause
        );
        error.stageId = stageId;
        error.artifacts = Object.freeze([...artifacts]);
        if (current === scope && !controller.signal.aborted) {
          host.onProgress(Object.freeze({ runId: scope.runId, stageId, status: 'failed', code: error.code, message: error.message }));
        }
        throw error;
      }
    })();
    pending.add(work);
    const release = () => {
      pending.delete(work);
      signal?.removeEventListener('abort', forwardAbort);
      controller.signal.removeEventListener('abort', onAbort);
      if (current === scope) current = null;
    };
    work.then(release, release);
    return Promise.race([work, interrupted]);
  }

  function close() {
    if (!closing) {
      closed = true;
      cancel();
      // Cancellation rejects the caller promptly. Drain actual plugin work before
      // the host releases resources borrowed by that work.
      closing = Promise.allSettled([...pending]).then(() => undefined);
    }
    return closing;
  }

  return Object.freeze({ run, cancel, close });
}
