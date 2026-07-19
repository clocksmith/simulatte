(function attachCivilTime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCivilTime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCivilTimeModule() {
  function resolve({ civilTime, timeZone, disambiguation = 'reject' }) {
    const parts = parse(civilTime);
    if (typeof timeZone !== 'string' || !timeZone) throw timeError('civil_time_zone_invalid', String(timeZone));
    if (!['reject', 'earlier', 'later'].includes(disambiguation)) throw timeError('civil_time_disambiguation_invalid', disambiguation);
    const targetMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const candidates = [];
    for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
      const instantMs = targetMs - offsetMinutes * 60_000;
      if (partsAt(instantMs, timeZone) === key(parts)) candidates.push(instantMs);
    }
    const unique = [...new Set(candidates)].sort((left, right) => left - right);
    if (!unique.length) throw timeError('civil_time_nonexistent', `${civilTime} in ${timeZone}`);
    if (unique.length > 1 && disambiguation === 'reject') throw timeError('civil_time_ambiguous', `${civilTime} in ${timeZone}`);
    const selectedMs = disambiguation === 'later' ? unique.at(-1) : unique[0];
    return Object.freeze({ schema: 'simulatte.civilTimeResolution.v1', civilTime, timeZone, disambiguation, candidateCount: unique.length, utcInstant: new Date(selectedMs).toISOString(), offsetMinutes: Math.round((targetMs - selectedMs) / 60_000) });
  }
  function parse(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
    if (!match) throw timeError('civil_time_invalid', String(value));
    const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0) };
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
    if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month || date.getUTCDate() !== parts.day || date.getUTCHours() !== parts.hour || date.getUTCMinutes() !== parts.minute || date.getUTCSeconds() !== parts.second) throw timeError('civil_time_invalid', value);
    return parts;
  }
  function partsAt(instantMs, timeZone) {
    let formatter;
    try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
    catch { throw timeError('civil_time_zone_invalid', timeZone); }
    const rows = Object.fromEntries(formatter.formatToParts(new Date(instantMs)).filter((row) => row.type !== 'literal').map((row) => [row.type, row.value]));
    return `${rows.year}-${rows.month}-${rows.day}T${rows.hour}:${rows.minute}:${rows.second}`;
  }
  function key(parts) { return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`; }
  function timeError(code, detail) { const error = new Error(`${code}: ${detail}`); error.name = 'SimulatteCivilTimeError'; error.code = code; return error; }
  return { resolve };
});
