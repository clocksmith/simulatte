#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONTRACT = path.join(ROOT, 'docs/simulatte/folder-contract.json');
const DEFAULT_SCHEMA = path.join(ROOT, 'docs/simulatte/folder-contract.schema.json');
const DEFAULT_POLICY = path.join(ROOT, 'docs/simulatte/folder-contract-judge-policy.md');
const REVIEW_DIFF_MAX_BYTES = 8 * 1024 * 1024;
const REVIEW_DIFF_FILE_MAX_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const options = { adapterArgs: [], model: 'unassigned-local-review', runFreshness: true };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--contract') options.contractPath = path.resolve(value());
    else if (key === '--schema') options.schemaPath = path.resolve(value());
    else if (key === '--policy') options.policyPath = path.resolve(value());
    else if (key === '--validation-receipt') options.validationReceiptPath = path.resolve(value());
    else if (key === '--out') options.outputPath = path.resolve(value());
    else if (key === '--model') options.model = value();
    else if (key === '--adapter') options.adapter = value();
    else if (key === '--adapter-arg') options.adapterArgs.push(value());
    else if (key === '--no-freshness') options.runFreshness = false;
    else if (key === '--help') {
      process.stdout.write('usage: run-folder-contract-judge.mjs [--model ID] [--adapter EXECUTABLE --adapter-arg VALUE] [--validation-receipt FILE] [--out FILE] [--no-freshness]\n');
      process.exit(0);
    } else throw new Error(`folder_contract_judge_argument_unknown: ${argv[index]}`);
  }
  options.contractPath ||= DEFAULT_CONTRACT;
  options.schemaPath ||= DEFAULT_SCHEMA;
  options.policyPath ||= DEFAULT_POLICY;
  options.outputPath ||= path.join(ROOT, 'artifacts/folder-contract/judge-receipt.json');
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileHash(filePath) {
  return hash(fs.readFileSync(filePath));
}

function invariant(condition, code, message) {
  if (!condition) throw new Error(`${code}: ${message}`);
}

function validationReceipt(options) {
  if (options.validationReceiptPath) return readJson(options.validationReceiptPath);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-folder-contract-judge-'));
  const receiptPath = path.join(tempDirectory, 'validation.json');
  try {
    const args = [
      path.join(ROOT, 'tools/check-folder-contracts.mjs'),
      '--contract', options.contractPath,
      '--schema', options.schemaPath,
      '--repository-root', ROOT,
      '--catalog-root', path.resolve(ROOT, '..', 'ouroboros'),
      '--receipt', receiptPath,
      '--quiet',
    ];
    if (options.runFreshness) args.push('--run-freshness');
    execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    return readJson(receiptPath);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function isText(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  return !sample.includes(0);
}

function inspectedFile(relativePath, role) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null;
  const bytes = fs.readFileSync(absolutePath);
  const text = isText(bytes) && bytes.length <= 1024 * 1024;
  return {
    path: relativePath,
    role,
    bytes: bytes.length,
    sha256: hash(bytes),
    content: text ? bytes.toString('utf8') : null,
    omittedReason: text ? null : (isText(bytes) ? 'text-over-1MiB' : 'binary'),
  };
}

function fullDiffBinding() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-folder-contract-diff-'));
  const diffPath = path.join(tempDirectory, 'worktree.diff');
  const diffFd = fs.openSync(diffPath, 'w');
  let result;
  try {
    result = spawnSync('git', ['diff', '--no-ext-diff', '--binary', 'HEAD', '--', '.'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', diffFd, 'pipe'],
    });
  } finally {
    fs.closeSync(diffFd);
  }
  try {
    invariant(!result.error, 'folder_contract_judge_diff_failed', result.error?.message || 'git diff failed');
    invariant(result.status === 0, 'folder_contract_judge_diff_failed', String(result.stderr || `git exited ${result.status}`));
    return {
      bytes: fs.statSync(diffPath).size,
      sha256: fileHash(diffPath),
    };
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function reviewDiff(changedPaths) {
  const chunks = [];
  let includedBytes = 0;
  const append = (value) => {
    const text = String(value || '');
    const bytes = Buffer.byteLength(text);
    if (includedBytes + bytes > REVIEW_DIFF_MAX_BYTES) return false;
    chunks.push(text);
    includedBytes += bytes;
    return true;
  };
  const omit = (relativePath, reason) => append(
    `\n--- ${relativePath}\n[diff omitted: ${reason}]\n`
  );
  const stat = execFileSync('git', ['diff', '--no-ext-diff', '--stat', 'HEAD', '--', '.'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: REVIEW_DIFF_MAX_BYTES,
  });
  append(stat);
  for (const relativePath of [...new Set(changedPaths)].sort()) {
    const absolutePath = path.join(ROOT, relativePath);
    const bytes = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()
      ? fs.statSync(absolutePath).size
      : 0;
    if (bytes > REVIEW_DIFF_FILE_MAX_BYTES) {
      omit(relativePath, `${bytes} byte file exceeds the 1 MiB review limit; content hash is bound separately`);
      continue;
    }
    const result = spawnSync('git', ['diff', '--no-ext-diff', 'HEAD', '--', relativePath], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: REVIEW_DIFF_FILE_MAX_BYTES * 2,
    });
    if (result.error || result.status !== 0) {
      omit(relativePath, result.error?.code === 'ENOBUFS' ? 'patch exceeds the per-file review limit' : 'git diff failed');
      continue;
    }
    if (result.stdout && !append(result.stdout)) {
      omit(relativePath, 'bundle reached the 8 MiB review limit');
    }
  }
  return chunks.join('');
}

function pathsFromCommands(commands) {
  const paths = new Set();
  for (const command of commands) {
    for (const match of command.matchAll(/(?:^|\s)(tests\/[A-Za-z0-9._/*-]+\.(?:cjs|mjs|js))/g)) {
      const pattern = match[1];
      if (!pattern.includes('*')) paths.add(pattern);
    }
  }
  return paths;
}

function sourceReferencePath(reference, contract) {
  if (reference.repository === contract.project.repository) return { root: ROOT, relativePath: reference.path };
  if (reference.repository === 'ouroboros') return { root: path.resolve(ROOT, '..', 'ouroboros'), relativePath: reference.path };
  return { root: path.resolve(ROOT, '..', reference.repository), relativePath: reference.path };
}

function buildBundle(options, contract, validation, policyText) {
  invariant(validation.status === 'pass', 'folder_contract_judge_blocked', 'Deterministic validation did not pass');
  invariant(validation.contract.sha256 === fileHash(options.contractPath), 'folder_contract_judge_contract_stale', 'Validation receipt binds a different contract');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  invariant(validation.commit === commit, 'folder_contract_judge_commit_stale', 'Validation receipt binds a different commit');
  for (const row of validation.impact.fileMappings) {
    const absolutePath = path.join(ROOT, row.path);
    const actualHash = fs.existsSync(absolutePath) ? fileHash(absolutePath) : null;
    invariant(actualHash === row.sha256, 'folder_contract_judge_file_stale', `Validation receipt is stale for ${row.path}`);
  }
  const nodeMap = new Map(contract.nodes.map((node) => [node.id, node]));
  const selectedNodes = validation.impact.closureNodeIds.map((id) => nodeMap.get(id)).filter(Boolean);
  const changedPaths = validation.impact.fileMappings.map((row) => row.path);
  const sourcePaths = new Set(changedPaths);
  const testPaths = pathsFromCommands(validation.impact.deterministicCommands);
  const receiptPaths = new Set();
  selectedNodes.forEach((node) => (node.validation.requiredSourcePaths || []).forEach((sourcePath) => sourcePaths.add(sourcePath)));
  const sourceRefMap = new Map((contract.sourceRefs || []).map((reference) => [reference.id, reference]));
  for (const node of selectedNodes) {
    for (const id of node.validation.requiredSourceRefs || []) {
      const reference = sourceRefMap.get(id);
      if (!reference) continue;
      const located = sourceReferencePath(reference, contract);
      const absolutePath = path.join(located.root, located.relativePath);
      if (located.root !== ROOT || !fs.statSync(absolutePath).isFile()) continue;
      if (reference.kind === 'receipt') receiptPaths.add(located.relativePath);
      else sourcePaths.add(located.relativePath);
    }
  }
  changedPaths.filter((sourcePath) => sourcePath.startsWith('tests/')).forEach((sourcePath) => testPaths.add(sourcePath));
  changedPaths.filter((sourcePath) => /(?:receipt|evidence|report)\.json$/.test(sourcePath)).forEach((sourcePath) => receiptPaths.add(sourcePath));
  if (fs.existsSync(path.join(ROOT, 'artifacts/profile-evidence/index.json'))) receiptPaths.add('artifacts/profile-evidence/index.json');
  const source = [...sourcePaths].sort().map((sourcePath) => inspectedFile(sourcePath, 'source')).filter(Boolean);
  const tests = [...testPaths].sort().map((testPath) => inspectedFile(testPath, 'test')).filter(Boolean);
  const receipts = [...receiptPaths].sort().map((receiptPath) => inspectedFile(receiptPath, 'receipt')).filter(Boolean);
  const diffBinding = fullDiffBinding();
  const diff = reviewDiff(changedPaths);
  return {
    schema: 'simulatte.folderContractJudgeBundle.v1',
    bindings: {
      model: options.model,
      commit,
      contractSha256: fileHash(options.contractPath),
      policySha256: hash(policyText),
      deterministicValidationSha256: hash(canonicalJson(validation)),
      changedDiffSha256: diffBinding.sha256,
      changedDiffBytes: diffBinding.bytes,
    },
    deterministicValidation: validation,
    intentProse: selectedNodes.map((node) => ({ id: node.id, path: node.path, intent: node.intent, ownership: node.ownership, experience: node.experience || null })),
    changedDiff: diff,
    source,
    tests,
    receipts,
  };
}

function promptFor(policyText, bundle) {
  return [
    policyText.trim(),
    '',
    'Review the bound bundle below. Return only JSON with this exact shape:',
    '{"status":"pass|findings","findings":[{"kind":"semantic-drift|unsupported-claim|ownership-conflict|missing-evidence","nodeId":"...","path":"...","message":"...","evidence":["..."]}]}',
    'Do not waive or reinterpret deterministic failures. Cite only content in the bundle.',
    '',
    canonicalJson(bundle).trim(),
  ].join('\n');
}

function validateVerdict(value, contract) {
  invariant(value && ['pass', 'findings'].includes(value.status), 'folder_contract_judge_response_invalid', 'Judge status must be pass or findings');
  invariant(Array.isArray(value.findings), 'folder_contract_judge_response_invalid', 'Judge findings must be an array');
  const allowed = new Set(contract.judgePolicy.allowedFindings);
  const nodes = new Set(contract.nodes.map((node) => node.id));
  value.findings.forEach((finding) => {
    invariant(allowed.has(finding.kind), 'folder_contract_judge_finding_invalid', `Finding kind ${finding.kind} is not allowed`);
    invariant(nodes.has(finding.nodeId), 'folder_contract_judge_finding_invalid', `Finding node ${finding.nodeId} is unknown`);
    invariant(typeof finding.path === 'string' && typeof finding.message === 'string' && Array.isArray(finding.evidence), 'folder_contract_judge_finding_invalid', 'Finding fields are incomplete');
  });
  invariant((value.status === 'pass') === (value.findings.length === 0), 'folder_contract_judge_response_invalid', 'Pass requires zero findings and findings status requires at least one');
  return value;
}

function runAdapter(options, prompt, contract) {
  if (!options.adapter) return { status: 'pending', findings: [], reason: 'No model adapter was selected; the bound review bundle is ready for local adjudication.' };
  const result = spawnSync(options.adapter, options.adapterArgs, { cwd: ROOT, input: prompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  invariant(result.status === 0, 'folder_contract_judge_adapter_failed', String(result.stderr || `Adapter exited ${result.status}`));
  return validateVerdict(JSON.parse(result.stdout), contract);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const contract = readJson(options.contractPath);
  const policyText = fs.readFileSync(options.policyPath, 'utf8');
  invariant(contract.judgePolicy?.deterministicFailuresAuthoritative === true, 'folder_contract_judge_policy_invalid', 'Contract judge policy is not fail-closed');
  const validation = validationReceipt(options);
  const bundle = buildBundle(options, contract, validation, policyText);
  const prompt = promptFor(policyText, bundle);
  const verdict = runAdapter(options, prompt, contract);
  const inspectedFiles = [...bundle.source, ...bundle.tests, ...bundle.receipts]
    .map(({ path: filePath, role, bytes, sha256 }) => ({ path: filePath, role, bytes, sha256 }));
  const receipt = {
    schema: 'simulatte.folderContractJudgeReceipt.v1',
    status: verdict.status,
    findings: verdict.findings,
    ...(verdict.reason ? { reason: verdict.reason } : {}),
    bindings: {
      ...bundle.bindings,
      promptSha256: hash(prompt),
      prompt: prompt,
      policyPath: path.relative(ROOT, options.policyPath),
      contractPath: path.relative(ROOT, options.contractPath),
      inspectedFiles,
    },
  };
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, canonicalJson(receipt));
  process.stdout.write(`Folder-contract judge ${receipt.status}: ${path.relative(ROOT, options.outputPath)} (${receipt.findings.length} findings).\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
