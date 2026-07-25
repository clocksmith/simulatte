(function attachSimulattePositiveLanguage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePositiveLanguage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPositiveLanguageApi() {
  const WORD = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
  const CLAUSE_BOUNDARY = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
  const NEGATED_PHRASE = new RegExp(
    `\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b` +
    `(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${CLAUSE_BOUNDARY}\\b)${WORD}){1,6}`,
    'gi'
  );

  function positiveLanguageText(value = '', options = {}) {
    const source = options.lowercase === true
      ? String(value || '').toLowerCase()
      : String(value || '');
    return source.replace(NEGATED_PHRASE, ' ').replace(/\s+/g, ' ').trim();
  }

  return Object.freeze({
    positiveLanguageText,
  });
});
