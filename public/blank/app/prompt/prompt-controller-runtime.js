(function attachSimulattePromptControllerRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptControllerRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPromptControllerRuntime() {
    function createFpsMeter(node, canvas) {
        let lastNow = 0;
        let frameCount = 0;
        let elapsedMs = 0;
        let lastVisible = false;

        function publish(fps, visible) {
          if (canvas && canvas.dataset) {
            canvas.dataset.fps = visible ? String(fps) : '0';
          }
          if (!node) return;
          if (!visible) {
            if (lastVisible) node.textContent = 'FPS --';
            node.dataset.perf = 'idle';
            lastVisible = false;
            return;
          }
          lastVisible = true;
          node.textContent = `${fps} FPS`;
          node.dataset.perf = fps < 24 ? 'low' : fps < 45 ? 'warn' : 'ok';
        }

        return {
          sample(now, visible) {
            if (!visible) {
              lastNow = now;
              frameCount = 0;
              elapsedMs = 0;
              publish(0, false);
              return;
            }
            if (!lastNow) {
              lastNow = now;
              return;
            }
            const delta = Math.max(0, Math.min(1000, now - lastNow));
            lastNow = now;
            frameCount += 1;
            elapsedMs += delta;
            if (elapsedMs < 500) return;
            const fps = Math.round((frameCount * 1000) / Math.max(1, elapsedMs));
            publish(fps, true);
            frameCount = 0;
            elapsedMs = 0;
          },
        };
      }

    function createIntentWorkerClient(root, onProgress = null) {
        const view = root && root.defaultView;
        if (!view || typeof view.Worker !== 'function') return null;
        let worker = null;
        let failed = false;
        let nextId = 0;
        let queue = Promise.resolve();
        const pending = new Map();
        const config = intentWorkerConfig(view);

        function rejectAll(error) {
          failed = true;
          pending.forEach((entry) => entry.reject(error));
          pending.clear();
        }

        function abortedError(message = 'Intent worker request superseded') {
          const error = new Error(message);
          error.name = 'AbortError';
          error.code = 'SIMULATTE_INTENT_ABORTED';
          return error;
        }

        function ensureWorker() {
          if (worker) return worker;
          if (failed) throw new Error('Intent worker unavailable');
          const url = new URL('./app/workers/simulatte-intent-worker.js', documentBaseUrl(view));
          appendBuildVersion(url, view);
          try {
            worker = new view.Worker(url, { name: 'simulatte-intent-worker' });
          } catch (error) {
            failed = true;
            throw error;
          }
          worker.addEventListener('message', (event) => {
            const data = event && event.data || {};
            const entry = pending.get(data.id);
            if (data.type === 'simulatte:intent-worker:progress') {
              if (entry && typeof entry.onProgress === 'function') entry.onProgress(data.event || {});
              return;
            }
            if (data.type === 'simulatte:intent-worker:preview') {
              if (entry && typeof entry.onPreview === 'function') entry.onPreview(data.preview || {});
              return;
            }
            if (data.type !== 'simulatte:intent-worker:result' || !entry) return;
            pending.delete(data.id);
            if (data.ok) entry.resolve(data.result);
            else entry.reject(new Error(data.error || 'Intent worker failed'));
          });
          worker.addEventListener('error', (event) => {
            rejectAll(new Error(event.message || 'Intent worker failed'));
          });
          worker.addEventListener('messageerror', () => {
            rejectAll(new Error('Intent worker message clone failed'));
          });
          return worker;
        }

        function request(type, payload = {}, options = {}) {
          const run = () => {
            try {
              ensureWorker();
            } catch (error) {
              return Promise.reject(error);
            }
            const id = nextId + 1;
            nextId = id;
            return new Promise((resolve, reject) => {
              pending.set(id, {
                resolve,
                reject,
                onProgress: options.onProgress,
                onPreview: options.onPreview,
              });
              try {
                worker.postMessage({
                  type,
                  id,
                  config,
                  ...payload,
                });
              } catch (error) {
                pending.delete(id);
                reject(error);
              }
            });
          };
          const next = queue.then(run, run);
          queue = next.then(() => undefined, () => undefined);
          return next;
        }

        return {
          backend: 'intent-worker',
          cancel(message) {
            if (!worker && !pending.size) return;
            const error = abortedError(message);
            pending.forEach((entry) => entry.reject(error));
            pending.clear();
            if (worker) worker.terminate();
            worker = null;
            queue = Promise.resolve();
          },
          loadModel() {
            return request('simulatte:intent-worker:load', {}, {
              onProgress,
              onPreview: null,
            });
          },
          rankPrompt(prompt, _primitives, options = {}) {
            return request('simulatte:intent-worker:rank', {
              prompt,
              options: cloneIntentWorkerOptions(options),
            }, {
              onProgress: options.onProgress,
              onPreview: options.onPreview,
            });
          },
        };
      }

    function intentWorkerConfig(view) {
        const absolute = (value) => versionedLocalUrl(value, view);
        return {
          manifestUrl: absolute('../data/simulatte-embedder/manifest.json'),
          spanLevelEmbedding: cloneWorkerValue(urlParam(view, 'spanLevelEmbedding') || ''),
          traceEmbeddings: intentTraceEnabled(view),
        };
      }

    function cloneIntentWorkerOptions(options = {}) {
        const out = {};
        for (const key of [
          'max',
          'nowIso',
          'spanLevelEmbedding',
          'traceEmbeddings',
          'queryPlan',
          'sceneLanguageGraph',
          'classificationTierId',
        ]) {
          if (options[key] !== undefined) out[key] = cloneWorkerValue(options[key]);
        }
        return out;
      }

    function cloneWorkerValue(value) {
        if (value == null || value === '') return value;
        if (typeof value !== 'object') return value;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (_err) {
          return undefined;
        }
      }

    function urlParam(view, name) {
        try {
          return new URLSearchParams(view.location && view.location.search || '').get(name) || '';
        } catch (_err) {
          return '';
        }
      }

    function unregisterLegacyModelCacheWorker(view) {
        const serviceWorker = view && view.navigator && view.navigator.serviceWorker;
        if (!serviceWorker || typeof serviceWorker.getRegistrations !== 'function') return;
        serviceWorker.getRegistrations()
          .then((registrations) => {
            registrations.forEach((registration) => {
              const scriptUrls = [
                registration.active && registration.active.scriptURL,
                registration.waiting && registration.waiting.scriptURL,
                registration.installing && registration.installing.scriptURL,
              ].filter(Boolean);
              if (scriptUrls.some((url) => /\/simulatte-model-cache-sw\.js(?:[?#].*)?$/.test(String(url)))) {
                registration.unregister().catch(() => {});
              }
            });
          })
          .catch(() => {});
      }

    function intentTraceEnabled(view) {
        return ['embeddingTrace', 'embeddingTiming', 'intentTrace', 'modelTrace']
          .some((name) => truthyParam(urlParam(view, name)));
      }

    function truthyParam(value) {
        return /^(1|true|on|yes|debug|trace)$/i.test(String(value || '').trim());
      }

    function appBuildVersion(view) {
        const doc = view && view.document;
        const meta = doc && doc.querySelector && doc.querySelector('meta[name="simulatte-build"]');
        return meta ? String(meta.getAttribute('content') || '').trim() : '';
      }

    function appendBuildVersion(url, view) {
        const build = appBuildVersion(view);
        if (!build || !url || url.origin !== view.location.origin) return url;
        url.searchParams.set('v', build);
        return url;
      }

    function versionedLocalUrl(value, view) {
      const url = new URL(value, documentBaseUrl(view));
      appendBuildVersion(url, view);
      return url.toString();
    }

    function documentBaseUrl(view) {
      return (view && view.document && view.document.baseURI) || view.location.href;
    }

  function createCompilerDispatch({ pipelineCompiler, publishRuntime, waitForLoadingPaint, createSpecFromPrompt }) {
        async function compilePromptSpec(prompt, options, event = {}) {
          const workerDetail = pipelineCompiler ? 'pipeline worker' : 'main-thread fallback';
          const onPhaseProgress = (progressEvent = {}) => publishRuntime({
            ...progressEvent,
            backend: event.backend,
            canvasLoading: event.canvasLoading,
          });
          publishRuntime({
            state: 'active',
            stage: 'pipeline-dispatch',
            taskPercent: 0,
            progressScope: 'task',
            percent: event.percent || 31,
            message: 'Starting compiler',
            backend: event.backend,
            detail: event.detail || workerDetail,
            canvasLoading: event.canvasLoading,
          });
          await waitForLoadingPaint();
          if (pipelineCompiler) {
            try {
              return await pipelineCompiler.compile(prompt, {
                ...options,
                compilerLane: 'pipeline-worker',
              }, onPhaseProgress);
            } catch (error) {
              if (error && error.code === 'SIMULATTE_PIPELINE_ABORTED') throw error;
              if (!error || error.code !== 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE') throw error;
              if (typeof console !== 'undefined' && console.warn) {
                console.warn('[simulatte.pipeline] worker compile fell back to main thread', error);
              }
              publishRuntime({
                state: 'active',
                stage: 'pipeline-dispatch',
                taskPercent: 0,
                progressScope: 'task',
                percent: event.percent || 31,
                message: 'Restarting compiler on main thread',
                backend: event.backend,
                detail: error && error.message ? error.message : String(error || ''),
                canvasLoading: event.canvasLoading,
              });
              await waitForLoadingPaint();
            }
          }
          return createSpecFromPrompt(prompt, {
            ...options,
            compilerLane: 'main-thread',
            onPhaseProgress,
          });
        }
    return compilePromptSpec;
  }

  return Object.freeze({
    createCompilerDispatch,
    createFpsMeter,
    createIntentWorkerClient,
    intentWorkerConfig,
    cloneIntentWorkerOptions,
    cloneWorkerValue,
    urlParam,
    unregisterLegacyModelCacheWorker,
    intentTraceEnabled,
    truthyParam,
    appBuildVersion,
    appendBuildVersion,
    versionedLocalUrl,
    documentBaseUrl,
  });
});
