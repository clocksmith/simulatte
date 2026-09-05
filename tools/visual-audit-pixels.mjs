import crypto from 'node:crypto';
import zlib from 'node:zlib';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function pngVisualStats(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) {
    return null;
  }
  let offset = signature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || bitDepth !== 8 || !channels || !idat.length) return null;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upLeft);
      row[x] = value & 255;
    }
  }
  let hash = 2166136261;
  let samples = 0;
  let sum = 0;
  let sumSq = 0;
  let colored = 0;
  let nearWhite = 0;
  let edgeSamples = 0;
  let strongEdges = 0;
  const sampleRgb = [];
  const yStep = Math.max(1, Math.floor(height / 72));
  const xStep = Math.max(1, Math.floor(width / 96));
  for (let y = 0; y < height; y += yStep) {
    for (let x = 0; x < width; x += xStep) {
      const pixel = (y * width + x) * channels;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      sampleRgb.push(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luma;
      sumSq += luma * luma;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 16) colored += 1;
      if (luma >= 245) nearWhite += 1;
      if (x + xStep < width && y + yStep < height) {
        const right = (y * width + x + xStep) * channels;
        const below = ((y + yStep) * width + x) * channels;
        const rightLuma = 0.2126 * pixels[right] + 0.7152 * pixels[right + 1] + 0.0722 * pixels[right + 2];
        const belowLuma = 0.2126 * pixels[below] + 0.7152 * pixels[below + 1] + 0.0722 * pixels[below + 2];
        if (Math.max(Math.abs(luma - rightLuma), Math.abs(luma - belowLuma)) >= 24) strongEdges += 1;
        edgeSamples += 1;
      }
      hash ^= r + (g << 8) + (b << 16) + samples;
      hash = Math.imul(hash, 16777619) >>> 0;
      samples += 1;
    }
  }
  const mean = samples ? sum / samples : 0;
  const variance = samples ? Math.max(0, sumSq / samples - mean * mean) : 0;
  return {
    width,
    height,
    sampleCount: samples,
    lumaMean: Number(mean.toFixed(3)),
    lumaStd: Number(Math.sqrt(variance).toFixed(3)),
    coloredRatio: samples ? Number((colored / samples).toFixed(4)) : 0,
    nearWhiteRatio: samples ? Number((nearWhite / samples).toFixed(4)) : 0,
    strongEdgeRatio: edgeSamples ? Number((strongEdges / edgeSamples).toFixed(4)) : 0,
    perceptualHash: differenceHash(pixels, width, height, channels),
    hash: (hash >>> 0).toString(16).padStart(8, '0'),
    sampleRgb,
  };
}

function sampledFrameDifference(left = null, right = null) {
  const a = left && left.sampleRgb || [];
  const b = right && right.sampleRgb || [];
  const length = Math.min(a.length, b.length);
  if (!length || length % 3 !== 0) return { meanAbsoluteDelta: 0, changedPixelRatio: 0 };
  let total = 0;
  let changed = 0;
  for (let offset = 0; offset < length; offset += 3) {
    const delta = (Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) +
      Math.abs(a[offset + 2] - b[offset + 2])) / 3;
    total += delta;
    if (delta >= 6) changed += 1;
  }
  const pixelCount = length / 3;
  return {
    meanAbsoluteDelta: Number((total / pixelCount).toFixed(4)),
    changedPixelRatio: Number((changed / pixelCount).toFixed(5)),
  };
}

function differenceHash(pixels, width, height, channels) {
  const columns = 9;
  const rows = 8;
  let value = 0n;
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(height - 1, Math.floor((row + 0.5) * height / rows));
    let previous = null;
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, Math.floor((column + 0.5) * width / columns));
      const offset = (y * width + x) * channels;
      const luma = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
      if (previous !== null) {
        value = (value << 1n) | (previous > luma ? 1n : 0n);
      }
      previous = luma;
    }
  }
  return value.toString(16).padStart(16, '0');
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}


export { sha256Hex, pngVisualStats, sampledFrameDifference };
