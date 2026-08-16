(function attachSimulatteAppRenderWork(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAppRenderWork = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAppRenderWorkApi() {
  function record(values, durationMs) {
    if (values.length >= 128) values.shift();
    values.push(Number(durationMs));
  }

  function receipt(work) {
    const summarize = (values) => ({
      sampleCount: values.length,
      totalMs: values.reduce((sum, value) => sum + value, 0),
      maxMs: Math.max(0, ...values),
    });
    return {
      schema: 'simulatte.appRenderWorkReceipt.v1',
      samples: work.phases.total.length,
      phases: Object.fromEntries(Object.entries(work.phases).map(([key, values]) => [key, summarize(values)])),
    };
  }

  return Object.freeze({ receipt, record });
});
