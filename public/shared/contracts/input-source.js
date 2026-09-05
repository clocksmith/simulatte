(function attachInputSource(root, factory) {
  const spec = typeof module === 'object' && module.exports ? require('./world-spec.js') : root.SimulatteWorldSpec;
  const api = factory(spec);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteInputSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInputSource(spec) {
  if (!spec) throw new Error('input_source_world_spec_missing');
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_ROWS = 10000;
  const MAX_COLUMNS = 64;

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function checkSignal(signal) {
    if (signal?.aborted) throw fail('input_cancelled', 'Input loading was cancelled');
  }

  async function sha256(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false, closed = false, recordStarted = false;
    function cell() { row.push(field); field = ''; closed = false; }
    function line() {
      cell();
      if (recordStarted) rows.push(row);
      row = []; recordStarted = false;
      if (rows.length > MAX_ROWS + 1) throw fail('input_rows_limit', `At most ${MAX_ROWS} rows are supported`);
    }
    for (let index = 0; index < text.length; index += 1) {
      const value = text[index];
      if (value !== '\n' && value !== '\r') recordStarted = true;
      if (quoted) {
        if (value === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
        else if (value === '"') { quoted = false; closed = true; }
        else field += value;
      } else if (value === ',') cell();
      else if (value === '\n' || value === '\r') {
        if (value === '\r' && text[index + 1] === '\n') index += 1;
        line();
      } else if (value === '"' && !field && !closed) quoted = true;
      else if (closed || value === '"') throw fail('input_csv_quote', 'Unexpected text beside a CSV quote');
      else field += value;
      if (row.length > MAX_COLUMNS || field.length > MAX_BYTES) throw fail('input_columns_limit', 'CSV input exceeds its bounds');
    }
    if (quoted) throw fail('input_csv_quote', 'CSV contains an unclosed quoted field');
    if (field || row.length || closed) line();
    const columns = rows.shift() || [];
    validateColumns(columns);
    return rows.map((values, index) => {
      if (values.length !== columns.length) throw fail('input_csv_width', `Row ${index + 2}: expected ${columns.length} columns, received ${values.length}`);
      return Object.fromEntries(columns.map((column, at) => [column, values[at]]));
    });
  }

  function validateColumns(columns) {
    if (!columns.length || columns.length > MAX_COLUMNS || new Set(columns).size !== columns.length ||
      columns.some((key) => !key.trim() || key.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(key))) {
      throw fail('input_columns_invalid', `Expected 1–${MAX_COLUMNS} unique, nonempty column names`);
    }
  }

  function table(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) {
      throw fail('input_rows_invalid', `Expected an array of 1–${MAX_ROWS} records`);
    }
    const columns = [...new Set(rows.flatMap((row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : []))];
    validateColumns(columns);
    rows.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw fail('input_row_invalid', `Row ${index + 1} must be a record`);
      Object.entries(row).forEach(([key, value]) => {
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value) ||
          typeof value === 'number' && !Number.isFinite(value)) {
          throw fail('input_cell_invalid', `Row ${index + 1}, ${key}: expected a finite scalar or null`);
        }
      });
    });
    return { columns, rows };
  }

  async function decode(text, { name = 'Pasted input', format = 'auto', origin = 'local', signal } = {}) {
    checkSignal(signal);
    if (typeof text !== 'string') throw fail('input_text_invalid', 'Expected UTF-8 text');
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_BYTES) throw fail('input_size_limit', `Input exceeds ${MAX_BYTES} bytes`);
    const content = text.replace(/^\uFEFF/, '').trim();
    const selected = format === 'auto' ? /^[\[{]/.test(content) ? 'json' : 'csv' : format;
    if (!['json', 'csv'].includes(selected)) throw fail('input_format_unsupported', `Unsupported input format: ${format}`);
    let value;
    try { value = selected === 'json' ? JSON.parse(content) : parseCsv(content); }
    catch (error) {
      if (error.code) throw error;
      throw fail('input_json_invalid', `Invalid JSON: ${error.message}`);
    }
    const source = { schema: 'simulatte.inputSource.v1', name, format: selected, origin, byteLength: bytes.length, sha256: await sha256(bytes) };
    checkSignal(signal);
    if ([spec.WORLD_SPEC_SCHEMA, spec.LEGACY_SPEC_SCHEMA].includes(value?.schema)) {
      return { kind: value.schema === spec.LEGACY_SPEC_SCHEMA ? 'legacySpec' : 'worldSpec', source, spec: spec.parseWorldSpec(content) };
    }
    return { kind: 'table', source, ...table(value) };
  }

  async function readFile(file, { signal } = {}) {
    if (!file || typeof file.arrayBuffer !== 'function') throw fail('input_file_missing', 'Choose a file with readable bytes');
    if (file.size > MAX_BYTES) throw fail('input_size_limit', `Input exceeds ${MAX_BYTES} bytes`);
    checkSignal(signal);
    return decodeBytes(new Uint8Array(await file.arrayBuffer()), { name: file.name || 'Input file', signal });
  }

  function decodeBytes(bytes, options) {
    if (bytes.byteLength > MAX_BYTES) throw fail('input_size_limit', `Input exceeds ${MAX_BYTES} bytes`);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw fail('input_encoding_invalid', 'Input must be valid UTF-8'); }
    return decode(text, options);
  }

  async function readUrl(value, { signal, fetchImpl = fetch } = {}) {
    let url;
    try { url = new URL(value); }
    catch { throw fail('input_url_invalid', 'Use a complete HTTP(S) data URL'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw fail('input_url_invalid', 'Use an HTTP(S) URL without embedded credentials');
    checkSignal(signal);
    let response;
    try { response = await fetchImpl(url.href, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    catch (error) {
      checkSignal(signal);
      throw fail('input_network_failed', `Could not fetch input; check the URL, network, and server CORS permission: ${error.message}`);
    }
    if (!response.ok) throw fail('input_http_failed', `Input request failed: HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw fail('input_size_limit', `Input exceeds ${MAX_BYTES} bytes`);
    }
    if (!response.body?.getReader) throw fail('input_stream_missing', 'URL input requires bounded streaming support');
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        checkSignal(signal);
        const { done, value: chunk } = await reader.read();
        if (done) break;
        length += chunk.byteLength;
        if (length > MAX_BYTES) throw fail('input_size_limit', `Input exceeds ${MAX_BYTES} bytes`);
        chunks.push(chunk);
      }
    } catch (error) { await reader.cancel(); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    return decodeBytes(bytes, { name: url.pathname.split('/').pop() || url.hostname, origin: url.href, signal });
  }

  return Object.freeze({ MAX_BYTES, MAX_ROWS, MAX_COLUMNS, decode, readFile, readUrl, parseCsv, sha256 });
});
