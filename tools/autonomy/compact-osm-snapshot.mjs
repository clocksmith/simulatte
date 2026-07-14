#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function compactSnapshot(sourceDirectory, outputDirectory) {
  const sourceReceiptBytes = fs.readFileSync(path.join(sourceDirectory, 'snapshot-receipt.json'));
  const sourceReceipt = JSON.parse(sourceReceiptBytes.toString('utf8'));
  if (sourceReceipt.schema !== 'simulatte.autonomyDataFetchReceipt.v1') throw new Error('Expected a governed fetch receipt');
  if (fs.existsSync(outputDirectory)) throw new Error(`Output already exists: ${outputDirectory}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const files = sourceReceipt.files.filter((row) => row.output.endsWith('.osm')).sort((left, right) => left.output.localeCompare(right.output)).map((row) => {
    const raw = fs.readFileSync(path.join(sourceDirectory, row.output));
    if (raw.length !== row.byteCount || sha256(raw) !== row.sha256) throw new Error(`Source identity drift for ${row.output}`);
    const compressed = zlib.gzipSync(raw, { level: 9, mtime: 0 });
    const output = `${row.output}.gz`;
    fs.writeFileSync(path.join(outputDirectory, output), compressed);
    return {
      output,
      rawByteCount: raw.length,
      rawSha256: row.sha256,
      compressedByteCount: compressed.length,
      compressedSha256: sha256(compressed),
    };
  });
  const receipt = {
    schema: 'simulatte.autonomyOsmSourcePack.v1',
    id: 'nyc-osm-routing-2026-07-13',
    contentVersion: '2026-07-13',
    compression: 'gzip-level-9-mtime-0',
    sourceReceiptSha256: sha256(sourceReceiptBytes),
    plan: sourceReceipt.plan,
    files,
    claimBoundary: 'Compression preserves every fetched OSM XML byte. Fetch identity proves source capture only; modal routing requires the separate compiler and entry gates.',
  };
  fs.writeFileSync(path.join(outputDirectory, 'snapshot-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function verifySnapshot(directory) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'snapshot-receipt.json'), 'utf8'));
  if (receipt.schema !== 'simulatte.autonomyOsmSourcePack.v1') throw new Error('Expected compact OSM source pack');
  receipt.files.forEach((row) => {
    const compressed = fs.readFileSync(path.join(directory, row.output));
    if (compressed.length !== row.compressedByteCount || sha256(compressed) !== row.compressedSha256) throw new Error(`Compressed identity drift for ${row.output}`);
    const raw = zlib.gunzipSync(compressed);
    if (raw.length !== row.rawByteCount || sha256(raw) !== row.rawSha256) throw new Error(`Raw identity drift for ${row.output}`);
  });
  return { schema: receipt.schema, id: receipt.id, fileCount: receipt.files.length, sourceReceiptSha256: receipt.sourceReceiptSha256, status: 'verified' };
}

const [command, source, output] = process.argv.slice(2);
if (command === 'compact') console.log(JSON.stringify(compactSnapshot(path.resolve(source), path.resolve(output)), null, 2));
else if (command === 'verify') console.log(JSON.stringify(verifySnapshot(path.resolve(source)), null, 2));
else throw new Error('usage: compact-osm-snapshot.mjs compact SOURCE OUTPUT | verify DIRECTORY');

export { compactSnapshot, verifySnapshot };
