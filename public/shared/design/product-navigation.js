(function attachProductNavigation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.connect(root.document, root.location.hostname);
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProductNavigation() {
  function connect(documentRoot, hostname) {
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) return;
    for (const link of documentRoot.querySelectorAll('.sim-product-nav [data-local-href]')) {
      link.setAttribute('href', link.dataset.localHref);
    }
  }
  return Object.freeze({ connect });
});
