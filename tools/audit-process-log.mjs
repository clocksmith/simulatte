const DEFAULT_TAIL_CHARACTERS = 131072;

export function captureChildProcessOutput(child, options = {}) {
  const maxCharacters = Math.max(1024, Number(options.maxCharacters || DEFAULT_TAIL_CHARACTERS));
  const stdout = captureStreamTail(child && child.stdout, maxCharacters);
  const stderr = captureStreamTail(child && child.stderr, maxCharacters);
  return Object.freeze({
    snapshot() {
      return {
        schema: 'simulatte.auditChildProcessLog.v1',
        stdout: stdout.snapshot(),
        stderr: stderr.snapshot(),
      };
    },
  });
}

function captureStreamTail(stream, maxCharacters) {
  let tail = '';
  let characterCount = 0;
  let chunkCount = 0;
  if (stream && typeof stream.on === 'function') {
    stream.setEncoding?.('utf8');
    stream.on('data', (chunk) => {
      const text = String(chunk || '');
      characterCount += text.length;
      chunkCount += 1;
      tail = `${tail}${text}`.slice(-maxCharacters);
    });
  }
  return Object.freeze({
    snapshot() {
      return {
        characterCount,
        chunkCount,
        truncated: characterCount > tail.length,
        tail,
      };
    },
  });
}
