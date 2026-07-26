#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const SOURCE_DIRECTORY = resolve('tools/simulatte/data-sources/subsea-network');
const EXTRACT_PATH = resolve(SOURCE_DIRECTORY, 'fcc-source-extract-v1.json');
const SOURCES = Object.freeze([
  Object.freeze({
    id: 'fcc-license-register-2025',
    url: 'https://docs.fcc.gov/public/attachments/DA-26-197A3.pdf',
    fileName: 'da-26-197a3.pdf',
    expectedSha256: 'eaadcb659e59b39d60c1944253b896aafe924c9d89c827551aeee58edc735231',
    publishedThrough: '2025-12-31',
  }),
  Object.freeze({
    id: 'fcc-circuit-capacity-2024',
    url: 'https://docs.fcc.gov/public/attachments/DA-25-1072A2.pdf',
    fileName: 'da-25-1072a2.pdf',
    expectedSha256: '543558edfb752741cf87f8fa730cfe50f223175bcc1199bf63ce3db9e29fe426',
    publishedThrough: '2024-12-31',
  }),
]);

await mkdir(SOURCE_DIRECTORY, { recursive: true });
const loaded = [];
for (const source of SOURCES) {
  const response = await fetch(source.url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`subsea_source_fetch_failed: ${source.id} returned ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== source.expectedSha256) {
    throw new Error(
      `subsea_source_hash_mismatch: ${source.id} expected ${source.expectedSha256}, received ${actualSha256}`,
    );
  }
  const pdfPath = resolve(SOURCE_DIRECTORY, source.fileName);
  const textPath = pdfPath.replace(/\.pdf$/u, '.txt');
  await writeFile(pdfPath, bytes);
  const extracted = spawnSync('pdftotext', ['-layout', pdfPath, textPath], {
    encoding: 'utf8',
  });
  if (extracted.status !== 0) {
    throw new Error(`subsea_source_extract_failed: ${source.id}: ${extracted.stderr || extracted.stdout}`);
  }
  loaded.push(Object.freeze({
    ...source,
    pdfPath,
    textPath,
    actualSha256,
    text: await readFile(textPath, 'utf8'),
  }));
}

const licenseSource = loaded.find((row) => row.id === 'fcc-license-register-2025');
const capacitySource = loaded.find((row) => row.id === 'fcc-circuit-capacity-2024');
const payload = {
  schema: 'simulatte.subseaFccSourceExtract.v1',
  id: 'subsea-fcc-source-extract-v1',
  generatedBy: 'tools/subsea-network/fetch-fcc-license-register.mjs',
  retrievalDate: '2026-07-26',
  license: {
    identifier: 'FCC-public-record',
    requiredAttribution: 'Federal Communications Commission, Office of International Affairs',
  },
  sources: loaded.map((row) => ({
    id: row.id,
    url: row.url,
    fileName: row.fileName,
    sha256: row.actualSha256,
    publishedThrough: row.publishedThrough,
  })),
  licenses: parseLicenses(licenseSource.text, licenseSource.id),
  foreignLandingRows: parseForeignLandings(capacitySource.text, capacitySource.id),
  publicCapacityRows: parsePublicCapacities(capacitySource.text, capacitySource.id),
};
await writeFile(EXTRACT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(
  `Pinned ${payload.sources.length} FCC artifacts, ${payload.licenses.length} licenses, `
  + `${payload.foreignLandingRows.length} foreign landing rows, and `
  + `${payload.publicCapacityRows.length} public capacity rows.\n`,
);

function parseLicenses(text, sourceDocumentId) {
  const rows = [];
  let region = null;
  pageLines(text).forEach(({ page, lineNumber, line }) => {
    const heading = line.trim();
    if (['Americas Region', 'Atlantic Region', 'Pacific Region'].includes(heading)) {
      region = heading.replace(' Region', '').toLowerCase();
      return;
    }
    const match = line.match(
      /^\s*(.+?)\s{2,}(SCL-(?:LIC|MOD)-\d{8}-\d{5})\s{2,}(SCL-(?:LIC|MOD)-\d{8}-\d{5})\s*$/u,
    );
    if (!match || !region) return;
    rows.push({
      id: `fcc-license:${match[3].toLowerCase()}`,
      cableName: match[1].replace(/\*+$/u, '').trim(),
      region,
      originalFileNumber: match[2],
      currentLicenseNumber: match[3],
      sourceDocumentId,
      sourcePage: page,
      sourceLine: lineNumber,
    });
  });
  return uniqueBy(rows, (row) => row.currentLicenseNumber);
}

function parseForeignLandings(text, sourceDocumentId) {
  const rows = [];
  let insideAttachment = false;
  pageLines(text).forEach(({ page, lineNumber, line }) => {
    if (/Attachment A/u.test(line)) insideAttachment = true;
    if (/Attachment B/u.test(line)) insideAttachment = false;
    if (!insideAttachment) return;
    const match = line.match(
      /^\s*(\d+)\s+(Americas|Atlantic|Pacific)\s{2,}(.+?)\s{2,}([A-Za-zÀ-ž][A-Za-zÀ-ž .&'()/-]+?)\s*$/u,
    );
    if (!match) return;
    rows.push({
      id: `fcc-landing:${match[2].toLowerCase()}:${slug(match[3])}:${slug(match[4])}`,
      rowNumber: Number(match[1]),
      region: match[2].toLowerCase(),
      cableName: match[3].trim(),
      foreignLandingPoint: match[4].trim(),
      sourceDocumentId,
      sourcePage: page,
      sourceLine: lineNumber,
    });
  });
  return uniqueBy(rows, (row) => row.id);
}

function parsePublicCapacities(text, sourceDocumentId) {
  const rows = [];
  let insideTable = false;
  pageLines(text).forEach(({ page, lineNumber, line }) => {
    if (/^\s*Table 3\s*$/u.test(line)) insideTable = true;
    if (/^\s*Table 4\s*$/u.test(line)) insideTable = false;
    if (!insideTable) return;
    const match = line.match(
      /^\s*(\d+)\s+(.+?)\s{2,}([\d,]+\.\d|\*)\s{2,}([\d,]+\.\d|\*)\s*$/u,
    );
    if (!match || match[3] === '*' || match[4] === '*') return;
    rows.push({
      id: `fcc-capacity:${slug(match[2])}:2024`,
      cableName: match[2].trim(),
      availableCapacityGbps: Number(match[3].replaceAll(',', '')),
      plannedCapacityGbps: Number(match[4].replaceAll(',', '')),
      sourceDocumentId,
      sourcePage: page,
      sourceLine: lineNumber,
    });
  });
  return uniqueBy(rows, (row) => row.id);
}

function pageLines(text) {
  return text.split('\f').flatMap((pageText, pageIndex) => pageText.split(/\r?\n/u).map(
    (line, lineIndex) => ({
      page: pageIndex + 1,
      lineNumber: lineIndex + 1,
      line,
    }),
  ));
}

function uniqueBy(rows, keyFor) {
  return [...new Map(rows.map((row) => [keyFor(row), row])).values()];
}

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
