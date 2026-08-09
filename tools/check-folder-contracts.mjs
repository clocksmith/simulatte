#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const options = { changed: [], runFreshness: false, quiet: false, allowUnavailableExternalSources: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--contract') options.contractPath = path.resolve(value());
    else if (key === '--schema') options.schemaPath = path.resolve(value());
    else if (key === '--repository-root') options.repositoryRoot = path.resolve(value());
    else if (key === '--catalog-root') options.catalogRoot = path.resolve(value());
    else if (key === '--base') options.base = value();
    else if (key === '--changed') options.changed.push(value());
    else if (key === '--receipt') options.receiptPath = path.resolve(value());
    else if (key === '--run-freshness') options.runFreshness = true;
    else if (key === '--allow-unavailable-external-sources') options.allowUnavailableExternalSources = true;
    else if (key === '--quiet') options.quiet = true;
    else if (key === '--help') {
      process.stdout.write('usage: check-folder-contracts.mjs --contract FILE --schema FILE --repository-root DIR [--catalog-root DIR] [--base REF] [--changed PATH] [--run-freshness] [--allow-unavailable-external-sources] [--receipt FILE]\n');
      process.exit(0);
    } else throw new Error(`folder_contract_argument_unknown: ${argv[index]}`);
  }
  for (const key of ['contractPath', 'schemaPath', 'repositoryRoot']) {
    if (!options[key]) throw new Error(`folder_contract_argument_missing: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/-path$/, '')}`);
  }
  options.catalogRoot ||= path.resolve(path.dirname(options.schemaPath), '../../..');
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileHash(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function invariant(condition, code, message, details = null) {
  if (condition) return;
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details;
  throw error;
}

function validateShape(contract, schema) {
  invariant(schema?.$id?.includes('folder-contract'), 'folder_contract_schema_invalid', 'Shared schema identity is missing');
  invariant(contract?.schema === 'ouroboros.folderContract.v1', 'folder_contract_schema_mismatch', 'Contract schema must be ouroboros.folderContract.v1');
  invariant(contract.project?.id && contract.project?.repository, 'folder_contract_project_invalid', 'Project identity is incomplete');
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(contract.lastReviewed || ''), 'folder_contract_review_date_invalid', 'lastReviewed must be YYYY-MM-DD');
  invariant(Array.isArray(contract.nodes) && contract.nodes.length > 0, 'folder_contract_nodes_missing', 'At least one contract node is required');
  const allowedKinds = new Set(['runtime', 'shared-runtime', 'plugin', 'data', 'evidence', 'documentation', 'orchestration']);
  const allowedImpacts = new Set(['local', 'dependent', 'workspace']);
  const ids = new Set();
  contract.nodes.forEach((node) => {
    invariant(node.id && !ids.has(node.id), 'folder_contract_node_id_invalid', `Duplicate or missing node id ${node.id || '<missing>'}`);
    ids.add(node.id);
    invariant(node.path === '.' || (typeof node.path === 'string' && !node.path.startsWith('/') && !node.path.endsWith('/')), 'folder_contract_node_path_invalid', `Node ${node.id} path is not repository-relative`);
    invariant(allowedKinds.has(node.kind), 'folder_contract_node_kind_invalid', `Node ${node.id} has unsupported kind ${node.kind}`);
    invariant(node.intent?.purpose?.length >= 20 && node.intent?.actorOutcome?.length >= 20, 'folder_contract_intent_incomplete', `Node ${node.id} intent is incomplete`);
    invariant(node.intent?.mustPreserve?.length && node.intent?.mustNotClaim?.length && node.intent?.writingBoundary?.length >= 20, 'folder_contract_claim_boundary_incomplete', `Node ${node.id} claim boundary is incomplete`);
    invariant(node.ownership?.owns?.length && node.ownership?.changeEffects?.length, 'folder_contract_ownership_incomplete', `Node ${node.id} ownership is incomplete`);
    node.ownership.changeEffects.forEach((effect) => invariant(allowedImpacts.has(effect.impact), 'folder_contract_impact_invalid', `Node ${node.id} has invalid change impact`));
    invariant(node.validation?.deterministicCommands?.length && node.validation?.judgeInputs?.length, 'folder_contract_validation_incomplete', `Node ${node.id} validation is incomplete`);
    if (node.experience) validateExperience(node);
  });
  contract.nodes.forEach((node) => {
    if (node.parentId === null) return;
    invariant(ids.has(node.parentId), 'folder_contract_parent_missing', `Node ${node.id} parent ${node.parentId} does not exist`);
    const parent = contract.nodes.find((candidate) => candidate.id === node.parentId);
    invariant(parent.path === '.' || node.path === parent.path || node.path.startsWith(`${parent.path}/`), 'folder_contract_parent_path_invalid', `Node ${node.id} path is outside parent ${parent.id}`);
    (node.dependencyNodeIds || []).forEach((id) => invariant(ids.has(id), 'folder_contract_dependency_missing', `Node ${node.id} dependency ${id} does not exist`));
    (node.boundary?.allowedImportNodeIds || []).forEach((id) => invariant(ids.has(id), 'folder_contract_import_dependency_missing', `Node ${node.id} import dependency ${id} does not exist`));
  });
  const roots = contract.nodes.filter((node) => node.parentId === null);
  invariant(roots.length === 1 && roots[0].path === '.', 'folder_contract_root_invalid', 'Exactly one repository root node is required');
  if (contract.coverage) {
    invariant(Array.isArray(contract.coverage.uncoveredDirectories), 'folder_contract_coverage_invalid', 'Coverage must include uncoveredDirectories');
  }
  if (contract.judgePolicy) invariant(contract.judgePolicy.deterministicFailuresAuthoritative === true, 'folder_contract_judge_policy_invalid', 'Judge policy cannot override deterministic failures');
}

function validateExperience(node) {
  const requiredArrays = ['controls', 'urlParameters', 'simulationInputs', 'deterministicConfiguration', 'dataProvenance', 'browserPixels', 'resultMeaning', 'doesNotProve', 'recoveryStates', 'refusalStates', 'requiredTests', 'requiredBrowserJourneys'];
  for (const field of ['actor', 'job', 'trigger', 'terminalOutcome', 'coordinateSystem']) {
    invariant(typeof node.experience[field] === 'string' && node.experience[field].length >= 3, 'folder_contract_experience_incomplete', `Node ${node.id} experience.${field} is incomplete`);
  }
  requiredArrays.forEach((field) => invariant(Array.isArray(node.experience[field]) && node.experience[field].length > 0, 'folder_contract_experience_incomplete', `Node ${node.id} experience.${field} is empty`));
  invariant(node.experience.impact && ['local', 'dependent', 'workspace'].every((field) => typeof node.experience.impact[field] === 'string'), 'folder_contract_experience_impact_incomplete', `Node ${node.id} experience impact is incomplete`);
}

function repositoryFor(reference, contract, options) {
  if (reference.repository === contract.project.repository) return options.repositoryRoot;
  if (reference.repository === 'ouroboros') return options.catalogRoot;
  return path.resolve(options.catalogRoot, '..', reference.repository);
}

function repositoryIsAvailable(root, repository) {
  if (!fs.existsSync(root)) return false;
  try {
    const topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
    return path.basename(topLevel).toLowerCase() === repository.toLowerCase();
  } catch {
    return path.basename(root).toLowerCase() === repository.toLowerCase();
  }
}

function validateSourceReferences(contract, options) {
  const references = new Map();
  for (const reference of contract.sourceRefs || []) {
    invariant(reference.id && !references.has(reference.id), 'folder_contract_source_ref_duplicate', `Source reference ${reference.id || '<missing>'} is duplicated`);
    references.set(reference.id, reference);
    const root = repositoryFor(reference, contract, options);
    const isExternal = reference.repository !== contract.project.repository;
    if (isExternal && options.allowUnavailableExternalSources && !repositoryIsAvailable(root, reference.repository)) continue;
    invariant(fs.existsSync(path.join(root, reference.path)), 'folder_contract_source_ref_missing', `Source reference ${reference.id} does not exist`, { repository: reference.repository, path: reference.path });
  }
  for (const node of contract.nodes) {
    for (const referenceId of node.validation.requiredSourceRefs || []) {
      invariant(references.has(referenceId), 'folder_contract_required_source_ref_missing', `Node ${node.id} requires undeclared source reference ${referenceId}`);
    }
    for (const relativePath of node.validation.requiredSourcePaths || []) {
      invariant(fs.existsSync(path.join(options.repositoryRoot, relativePath)), 'folder_contract_required_source_path_missing', `Node ${node.id} requires missing path ${relativePath}`);
    }
  }
  return references;
}

function gitLines(root, args) {
  const output = execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return output.split('\n').map((row) => row.trim()).filter(Boolean);
}

function trackedInventory(root) {
  const files = [...new Set([
    ...gitLines(root, ['ls-files']),
    ...gitLines(root, ['ls-files', '--others', '--exclude-standard']),
  ])].sort();
  const directories = new Set();
  files.forEach((file) => {
    const parts = file.split('/');
    for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join('/'));
  });
  return { files, directories: [...directories].sort() };
}

function globRegex(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

function pathMatches(pattern, candidate) {
  return pattern === candidate || globRegex(pattern).test(candidate);
}

function nodePatterns(node) {
  return [node.path, ...(node.path === '.' ? [] : [`${node.path}/**`]), ...(node.matchPaths || [])];
}

function matchScore(pattern, candidate) {
  if (!pathMatches(pattern, candidate)) return -1;
  const literal = pattern.replace(/[?*]/g, '').length;
  return literal * 10 + (pattern === candidate ? 5 : 0);
}

function narrowestNode(contract, candidate) {
  const matches = contract.nodes.flatMap((node) => nodePatterns(node).map((pattern) => ({ node, pattern, score: matchScore(pattern, candidate) })))
    .filter((row) => row.score >= 0)
    .sort((left, right) => right.score - left.score || right.node.path.length - left.node.path.length || left.node.id.localeCompare(right.node.id));
  return matches[0]?.node || null;
}

function matchingClassification(contract, candidate) {
  return (contract.classifications || []).map((classification) => {
    const patterns = [classification.path, `${classification.path}/**`];
    return { classification, score: Math.max(...patterns.map((pattern) => matchScore(pattern, candidate))) };
  }).filter((row) => row.score >= 0).sort((left, right) => right.score - left.score)[0]?.classification || null;
}

function validateCoverage(contract, inventory) {
  const uncovered = [];
  let classifiedDirectories = 0;
  let coveredDirectories = 0;
  for (const directory of inventory.directories) {
    const classification = matchingClassification(contract, directory);
    if (classification) {
      classifiedDirectories += 1;
      continue;
    }
    const node = narrowestNode(contract, directory);
    if (!node || node.path === '.') uncovered.push(directory);
    else coveredDirectories += 1;
  }
  const actual = {
    trackedFiles: inventory.files.length,
    trackedDirectories: inventory.directories.length,
    coveredDirectories,
    classifiedDirectories,
    uncoveredDirectories: uncovered,
  };
  if (contract.coverage) {
    for (const field of ['trackedFiles', 'trackedDirectories', 'coveredDirectories', 'classifiedDirectories']) {
      invariant(contract.coverage[field] === actual[field], 'folder_contract_coverage_count_stale', `Coverage ${field} is ${contract.coverage[field]}; actual is ${actual[field]}`);
    }
    invariant(JSON.stringify(contract.coverage.uncoveredDirectories) === JSON.stringify(uncovered), 'folder_contract_uncovered_inventory_stale', 'Coverage uncoveredDirectories is stale', { expected: contract.coverage.uncoveredDirectories, actual: uncovered });
  }
  invariant(uncovered.length === 0, 'folder_contract_directories_uncovered', `${uncovered.length} tracked directories are not covered or classified`, uncovered);
  return actual;
}

function changedFiles(options, inventory) {
  if (options.changed.length) return [...new Set(options.changed)].sort();
  const args = ['diff', '--name-only', '--diff-filter=ACMRTUXB'];
  if (options.base) args.push(`${options.base}...HEAD`);
  else args.push('HEAD');
  const changed = gitLines(options.repositoryRoot, args);
  const untracked = gitLines(options.repositoryRoot, ['ls-files', '--others', '--exclude-standard']);
  const tracked = new Set(inventory.files);
  return [...new Set([...changed, ...untracked].filter((file) => tracked.has(file) || fs.existsSync(path.join(options.repositoryRoot, file))))].sort();
}

function impactClosure(contract, files) {
  const changedNodeIds = new Set();
  const fileMappings = files.map((file) => {
    const classification = matchingClassification(contract, file);
    const node = narrowestNode(contract, file);
    if (node) changedNodeIds.add(node.id);
    return { path: file, nodeId: node?.id || null, classification: classification?.classification || null };
  });
  const closure = new Set(changedNodeIds);
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const node of contract.nodes) {
      if (closure.has(node.id)) continue;
      if ((node.dependencyNodeIds || []).some((dependency) => closure.has(dependency))) {
        closure.add(node.id);
        advanced = true;
      }
    }
  }
  const nodes = contract.nodes.filter((node) => closure.has(node.id));
  return {
    fileMappings,
    changedNodeIds: [...changedNodeIds].sort(),
    closureNodeIds: nodes.map((node) => node.id).sort(),
    deterministicCommands: [...new Set(nodes.flatMap((node) => node.validation.deterministicCommands))].sort(),
    browserJourneys: [...new Set(nodes.flatMap((node) => node.validation.requiredBrowserJourneys || []))].sort(),
  };
}

function resolveImport(sourcePath, specifier, root) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(path.join(root, sourcePath)), specifier);
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`, path.join(base, 'index.js')];
  const target = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return target ? path.relative(root, target).split(path.sep).join('/') : null;
}

function staticImports(source) {
  const rows = [];
  const expressions = [/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g, /(?<![\w.])require\(\s*['"]([^'"]+)['"]\s*\)/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g];
  expressions.forEach((expression) => {
    for (const match of source.matchAll(expression)) rows.push(match[1]);
  });
  return [...new Set(rows)];
}

function validateImports(contract, inventory, root) {
  const violations = [];
  const edges = new Set();
  const nodesById = new Map(contract.nodes.map((node) => [node.id, node]));
  function inheritedAllowed(node) {
    const allowed = new Set([node.id]);
    for (let current = node; current; current = current.parentId ? nodesById.get(current.parentId) : null) {
      (current.boundary?.allowedImportNodeIds || []).forEach((id) => allowed.add(id));
    }
    return allowed;
  }
  function isAllowed(targetNode, allowed) {
    for (let current = targetNode; current; current = current.parentId ? nodesById.get(current.parentId) : null) {
      if (allowed.has(current.id)) return true;
    }
    return false;
  }
  for (const sourcePath of inventory.files.filter((file) => /\.(?:cjs|mjs|js)$/.test(file))) {
    const sourceNode = narrowestNode(contract, sourcePath);
    if (!sourceNode?.boundary?.enforceImports) continue;
    if (sourceNode.path === '.' || (sourcePath !== sourceNode.path && !sourcePath.startsWith(`${sourceNode.path}/`))) continue;
    const allowed = inheritedAllowed(sourceNode);
    const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    for (const specifier of staticImports(source)) {
      const targetPath = resolveImport(sourcePath, specifier, root);
      if (!targetPath) {
        if (!specifier.startsWith('.') && !specifier.startsWith('node:') && sourceNode.boundary.allowExternalPackages !== true) violations.push({ sourcePath, specifier, reason: 'external-package-not-declared' });
        continue;
      }
      const targetNode = narrowestNode(contract, targetPath);
      if (!targetNode) continue;
      edges.add(`${sourceNode.id}->${targetNode.id}`);
      if (!isAllowed(targetNode, allowed)) violations.push({ sourcePath, targetPath, sourceNodeId: sourceNode.id, targetNodeId: targetNode.id, reason: 'cross-boundary-import-not-declared' });
    }
  }
  invariant(violations.length === 0, 'folder_contract_import_boundary_violation', `${violations.length} imports cross an undeclared boundary`, violations);
  return [...edges].sort();
}

function runFreshnessChecks(contract, options) {
  if (!options.runFreshness) return [];
  return (contract.freshnessChecks || []).map((check) => {
    try {
      const output = execSync(check.command, { cwd: options.repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
      return { id: check.id, status: 'pass', output: output.trim().split('\n').slice(-5) };
    } catch (error) {
      invariant(false, 'folder_contract_freshness_failed', `Freshness check ${check.id} failed`, { command: check.command, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') });
    }
  });
}

function receiptFor({ contract, options, coverage, impact, imports, freshness }) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: options.repositoryRoot, encoding: 'utf8' }).trim();
  const inspectedFiles = impact.fileMappings.map((row) => ({
    ...row,
    sha256: fs.existsSync(path.join(options.repositoryRoot, row.path)) ? fileHash(path.join(options.repositoryRoot, row.path)) : null,
  }));
  return {
    schema: 'ouroboros.folderContractValidationReceipt.v1',
    projectId: contract.project.id,
    status: 'pass',
    commit,
    contract: { path: path.relative(options.repositoryRoot, options.contractPath), sha256: fileHash(options.contractPath) },
    schemaIdentity: { path: options.schemaPath, sha256: fileHash(options.schemaPath) },
    coverage,
    impact: { ...impact, fileMappings: inspectedFiles },
    importEdges: imports,
    freshness,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const contract = readJson(options.contractPath);
  const schema = readJson(options.schemaPath);
  validateShape(contract, schema);
  validateSourceReferences(contract, options);
  const inventory = trackedInventory(options.repositoryRoot);
  const coverage = validateCoverage(contract, inventory);
  const impact = impactClosure(contract, changedFiles(options, inventory));
  const imports = validateImports(contract, inventory, options.repositoryRoot);
  const freshness = runFreshnessChecks(contract, options);
  const receipt = receiptFor({ contract, options, coverage, impact, imports, freshness });
  if (options.receiptPath) {
    fs.mkdirSync(path.dirname(options.receiptPath), { recursive: true });
    fs.writeFileSync(options.receiptPath, canonicalJson(receipt));
  }
  if (!options.quiet) {
    process.stdout.write(`Folder contract valid: ${contract.project.id}; ${coverage.trackedDirectories} directories, ${contract.nodes.length} nodes, ${impact.closureNodeIds.length} affected nodes.\n`);
    process.stdout.write(`${JSON.stringify({ changedFiles: impact.fileMappings.length, commands: impact.deterministicCommands, browserJourneys: impact.browserJourneys }, null, 2)}\n`);
  }
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    if (error.details) process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    process.exitCode = 1;
  }
}

export { canonicalJson, impactClosure, matchingClassification, narrowestNode, trackedInventory, validateCoverage, validateImports, validateShape, validateSourceReferences };
