// This inner layer has no runtime, product, or platform dependencies.
export function failure(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  if (code === 'pipeline_cancelled') error.name = 'AbortError';
  return error;
}

export function snapshotPlugins(plugins) {
  if (!Array.isArray(plugins) || !plugins.length) {
    throw failure('pipeline_plugins_invalid', 'A nonempty ordered plugin array is required');
  }
  const ids = new Set();
  return Object.freeze(plugins.map(plugin => {
    if (!plugin || typeof plugin.id !== 'string' || !plugin.id.trim() || ids.has(plugin.id)) {
      throw failure('pipeline_plugins_invalid', 'Each plugin requires a distinct nonempty id');
    }
    ids.add(plugin.id);
    const result = { id: plugin.id };
    for (const method of ['validateInput', 'run', 'validateOutput']) {
      if (typeof plugin[method] !== 'function') {
        throw failure('pipeline_plugins_invalid', plugin.id + ' requires ' + method);
      }
      result[method] = plugin[method].bind(plugin);
    }
    return Object.freeze(result);
  }));
}

export function snapshotPorts(ports) {
  if (!ports || typeof ports.onProgress !== 'function' || typeof ports.yieldTask !== 'function') {
    throw failure('pipeline_ports_invalid', 'Explicit onProgress and yieldTask ports are required');
  }
  return Object.freeze({
    onProgress: ports.onProgress.bind(ports),
    yieldTask: ports.yieldTask.bind(ports),
  });
}

export async function validate(plugin, boundary, value) {
  if (await plugin[boundary](value) === false) {
    throw failure('pipeline_validation_failed', plugin.id + ' rejected ' + boundary);
  }
}
