(function attachSimulatteStreetNames(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteStreetNames = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStreetNameApi() {
  const STREET_WORDS = Object.freeze({
    avenue: 'av',
    ave: 'av',
    av: 'av',
    street: 'st',
    str: 'st',
    st: 'st',
    boulevard: 'blvd',
    blvd: 'blvd',
    road: 'rd',
    rd: 'rd',
    lane: 'ln',
    ln: 'ln',
    place: 'pl',
    pl: 'pl',
    square: 'sq',
    sq: 'sq',
  });

  function normalizeStreetWords(value, { omitArticles = false } = {}) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word && (!omitArticles || word !== 'the'))
      .map((word) => STREET_WORDS[word] || word);
  }

  function normalizeStreetName(value) {
    return normalizeStreetWords(value).join(' ');
  }

  return Object.freeze({
    STREET_WORDS,
    normalizeStreetWords,
    normalizeStreetName,
  });
});
