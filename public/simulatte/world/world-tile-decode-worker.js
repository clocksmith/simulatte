self.addEventListener('message', (event) => {
  const { operationId, bytes } = event.data || {};
  try {
    const value = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
    self.postMessage({ operationId, ok: true, value });
  } catch (error) {
    self.postMessage({ operationId, ok: false, error: { name: error.name, message: error.message } });
  }
});
