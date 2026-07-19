(function attachAccessibilityCompatibility(root, factory) {
  const audit = typeof module === 'object' && module.exports
    ? require('../plugins/accessible-journey/accessibility-audit.js')
    : root.SimulatteAccessibilityAudit;
  const api = factory(audit);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAccessibilityAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAccessibilityCompatibility(audit) {
  return audit;
});
