import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
}));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return chunk;
}

function encodeRgbaPng(capture) {
  const width = Number(capture?.width);
  const height = Number(capture?.height);
  if (!Number.isInteger(width) || width < 1 || width > 16384) throw new Error('profile_evidence_render_width_invalid');
  if (!Number.isInteger(height) || height < 1 || height > 16384) throw new Error('profile_evidence_render_height_invalid');
  if (capture?.format !== 'rgba8unorm') throw new Error('profile_evidence_render_format_invalid');
  const rgba = Buffer.from(String(capture.rgbaBase64 || ''), 'base64');
  const rowBytes = width * 4;
  if (rgba.length !== rowBytes * height) throw new Error('profile_evidence_render_byte_length_invalid');
  const scanlines = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rgba.copy(scanlines, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function unfilterPng(raw, width, height, channels) {
  const stride = width * channels;
  const output = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset++];
    for (let x = 0; x < stride; x += 1) {
      const byte = raw[inputOffset++];
      const left = x >= channels ? output[y * stride + x - channels] : 0;
      const up = y > 0 ? output[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? output[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const upDistance = Math.abs(estimate - up);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        predictor = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left : upDistance <= upperLeftDistance ? up : upperLeft;
      } else if (filter !== 0) {
        throw new Error(`profile_evidence_png_filter_unsupported: ${filter}`);
      }
      output[y * stride + x] = (byte + predictor) & 0xff;
    }
  }
  return output;
}

function inspectPng(buffer, method) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== PNG_SIGNATURE.toString('hex')) throw new Error('profile_evidence_screenshot_not_png');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`profile_evidence_png_bit_depth_unsupported: ${data[8]}`);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`profile_evidence_png_color_type_unsupported: ${colorType}`);
  const pixels = unfilterPng(zlib.inflateSync(Buffer.concat(idat)), width, height, channels);
  const colors = new Set();
  let nonTransparent = 0;
  const xStep = Math.max(1, Math.floor(width / 16));
  const yStep = Math.max(1, Math.floor(height / 16));
  let sampleCount = 0;
  for (let y = Math.floor(yStep / 2); y < height; y += yStep) {
    for (let x = Math.floor(xStep / 2); x < width; x += xStep) {
      const start = (y * width + x) * channels;
      const sample = [...pixels.subarray(start, start + channels)];
      const alpha = channels === 4 ? sample[3] : 255;
      if (alpha > 0) nonTransparent += 1;
      colors.add(sample.join(','));
      sampleCount += 1;
    }
  }
  return {
    method,
    width,
    height,
    sampleCount,
    nonTransparentSampleCount: nonTransparent,
    distinctColorCount: colors.size,
    status: nonTransparent === sampleCount && colors.size > 1 ? 'pass' : 'fail',
  };
}

export { encodeRgbaPng, inspectPng };
