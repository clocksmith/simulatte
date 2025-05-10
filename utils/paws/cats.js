#!/usr/bin/env node
// cats.js - Bundles project files into a single text artifact for LLMs.
const fs = require("fs");
const path = require("path");
const { Buffer } = require("buffer");

const FILE_START_MARKER_TEMPLATE = "--- CATS_START_FILE: {} ---";
const FILE_END_MARKER = "--- CATS_END_FILE ---";
const DEFAULT_ENCODING = "utf-8";
const DEFAULT_OUTPUT_FILENAME = "cats_out.bundle";
const BUNDLE_HEADER_PREFIX = "# Cats Bundle";
const BUNDLE_FORMAT_PREFIX = "# Format: ";

/**
 * Checks if file content is likely UTF-8 by attempting strict decoding.
 * @param {Buffer|Uint8Array} fileContentBytes - The byte content of the file.
 * @returns {boolean} True if likely UTF-8, false otherwise.
 */
function isLikelyUtf8(fileContentBytes) {
  if (!fileContentBytes || fileContentBytes.length === 0) {
    return true; // Empty files are UTF-8 compatible
  }
  try {
    const decoder = new TextDecoder(DEFAULT_ENCODING, { fatal: true });
    decoder.decode(fileContentBytes); // Will throw if not valid UTF-8
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Generates a relative path for the bundle marker, using forward slashes.
 * @param {string} fileRealPath - Absolute path to the file.
 * @param {string} commonAncestorPath - Absolute common ancestor path.
 * @returns {string} Relative path with forward slashes.
 */
function generateBundleRelativePath(fileRealPath, commonAncestorPath) {
  if (commonAncestorPath === fileRealPath) {
    // Input is a single file
    return path.basename(fileRealPath);
  }
  let relPath = path.relative(commonAncestorPath, fileRealPath);
  if (relPath === "" || relPath === ".") {
    // If commonAncestorPath is the file itself or its directory, relPath might be empty or "."
    // In such cases, use the basename.
    relPath = path.basename(fileRealPath);
  }
  return relPath.split(path.sep).join("/"); // Normalize to forward slashes
}

/**
 * Finds the longest common ancestor directory for a list of absolute paths.
 * @param {string[]} pathsList - List of absolute paths.
 * @returns {string} The common ancestor path.
 */
function findCommonAncestor(pathsList) {
  if (!pathsList || pathsList.length === 0) {
    return process.cwd();
  }
  // Normalize paths to absolute and resolve symlinks for consistent comparison
  const realPaths = pathsList.map((p) =>
    fs.existsSync(p) ? fs.realpathSync(path.resolve(p)) : path.resolve(p)
  );

  if (realPaths.length === 1) {
    try {
      const pStat = fs.statSync(realPaths[0]);
      return pStat.isFile() ? path.dirname(realPaths[0]) : realPaths[0];
    } catch (e) {
      // Path might not exist if it's a target output file not yet created
      return path.dirname(realPaths[0]);
    }
  }

  // Convert all paths to directory paths if they are files for common path logic
  const dirPaths = realPaths.map((p) => {
    try {
      return fs.statSync(p).isFile() ? path.dirname(p) : p;
    } catch (e) {
      // Path might not exist
      return path.dirname(p);
    }
  });

  if (dirPaths.length === 0) return process.cwd();
  if (dirPaths.length === 1) return dirPaths[0];

  let common = dirPaths[0];
  for (let i = 1; i < dirPaths.length; i++) {
    let currentPath = dirPaths[i];
    while (
      !currentPath.startsWith(common + path.sep) &&
      common !== path.parse(common).root &&
      common !== currentPath
    ) {
      common = path.dirname(common);
    }
    if (
      currentPath !== common &&
      !currentPath.startsWith(common + path.sep) &&
      common === path.parse(common).root
    ) {
      // No commonality beyond the root, or different roots.
      // This can happen with e.g. C:\foo and D:\bar on Windows.
      // Or /foo and /bar where common becomes /.
      // If path.dirname(common) is common, we are at root.
      if (path.dirname(common) === common) return common; // return root
    }
  }
  return common;
}

/**
 * Core bundling logic. Accepts prepared file data.
 * @param {Array<Object>} fileObjects - Array of objects like { relativePath: string, contentBytes: Buffer, isUtf8: boolean }.
 * @param {boolean} forceBase64Bundle - Whether to force Base64 for the entire bundle.
 * @param {boolean} anyNonUtf8AlreadyDetected - If non-UTF-8 content was found during file preparation.
 * @returns {{bundleString: string, formatDescription: string}}
 */
function performBundling(
  fileObjects,
  forceBase64Bundle,
  anyNonUtf8AlreadyDetected
) {
  const bundleLines = [];
  const useBase64ForAll = forceBase64Bundle || anyNonUtf8AlreadyDetected;

  let formatDescription = "";
  if (forceBase64Bundle) {
    formatDescription = "Base64 (Forced)";
  } else if (anyNonUtf8AlreadyDetected) {
    formatDescription = "Base64 (Auto-Detected due to non-UTF-8 content)";
  } else {
    formatDescription = `Raw ${DEFAULT_ENCODING} (All files appear UTF-8 compatible)`;
  }

  bundleLines.push(BUNDLE_HEADER_PREFIX);
  bundleLines.push(`${BUNDLE_FORMAT_PREFIX}${formatDescription}`);

  fileObjects.forEach((fileObj) => {
    bundleLines.push("");
    bundleLines.push(
      FILE_START_MARKER_TEMPLATE.replace("{}", fileObj.relativePath)
    );

    let contentToWrite = "";
    const contentBytes = fileObj.contentBytes; // Should be Buffer

    if (useBase64ForAll) {
      contentToWrite = contentBytes.toString("base64");
    } else {
      // Assumed to be UTF-8 at this point based on prior checks
      contentToWrite = contentBytes.toString(DEFAULT_ENCODING);
    }
    bundleLines.push(contentToWrite);
    bundleLines.push(FILE_END_MARKER);
  });
  return { bundleString: bundleLines.join("\n") + "\n", formatDescription };
}

/**
 * @typedef {Object} FileDataNode
 * @property {string} path - Absolute path to the file.
 * @property {string} relativePath - Relative path for the bundle.
 * @property {Buffer} contentBytes - File content as a Buffer.
 * @property {boolean} isUtf8 - Whether the content is UTF-8.
 */

/**
 * Prepares file objects by reading from disk (Node.js).
 * @param {string[]} absFilePaths - List of absolute file paths to read.
 * @param {string} commonAncestorForRelpath - Base path for generating relative paths.
 * @returns {Promise<{fileObjects: Array<FileDataNode>, anyNonUtf8Found: boolean}>}
 */
async function prepareFileObjectsFromPathsNode(
  absFilePaths,
  commonAncestorForRelpath
) {
  const fileObjects = [];
  let anyNonUtf8Found = false;

  for (const fileAbsPath of absFilePaths) {
    try {
      const contentBytes = await fs.promises.readFile(fileAbsPath); // Reads as Buffer
      const isUtf8 = isLikelyUtf8(contentBytes);
      if (!isUtf8) {
        anyNonUtf8Found = true;
      }
      let relativePath = generateBundleRelativePath(
        fileAbsPath,
        commonAncestorForRelpath
      );

      fileObjects.push({
        path: fileAbsPath,
        relativePath: relativePath,
        contentBytes: contentBytes,
        isUtf8: isUtf8,
      });
    } catch (e) {
      console.warn(
        `  Warning: Error reading file '${fileAbsPath}': ${e.message}. Skipping.`
      );
      continue;
    }
  }
  return { fileObjects, anyNonUtf8Found };
}

/**
 * Gets final list of paths to process, handling exclusions (Node.js).
 * @param {string[]} includePathsRaw - User-provided paths to include.
 * @param {string[]} excludePathsRaw - User-provided paths to exclude.
 * @param {string} [outputFileAbsPath] - Absolute path to the output bundle file for self-exclusion.
 * @returns {Promise<string[]>} Sorted list of absolute file paths.
 */
async function getFinalPathsToProcessNode(
  includePathsRaw,
  excludePathsRaw,
  outputFileAbsPath
) {
  const candidateFileRealpaths = new Set();
  const absExcludedRealpathsSet = new Set(
    excludePathsRaw
      .map((p) => path.resolve(p))
      .map((rp) => (fs.existsSync(rp) ? fs.realpathSync(rp) : rp))
  );
  const absExcludedDirsForPruningSet = new Set();

  for (const p of absExcludedRealpathsSet) {
    try {
      if (fs.existsSync(p) && (await fs.promises.stat(p)).isDirectory()) {
        absExcludedDirsForPruningSet.add(p);
      }
    } catch (e) {
      /* ignore if excluded path doesn't exist or error stating */
    }
  }

  const processedTopLevelInputRealpaths = new Set();

  for (const inclPathRaw of includePathsRaw) {
    const absInclPath = path.resolve(inclPathRaw);
    const currentInputRealpath = fs.existsSync(absInclPath)
      ? fs.realpathSync(absInclPath)
      : absInclPath;

    if (processedTopLevelInputRealpaths.has(currentInputRealpath)) continue;
    processedTopLevelInputRealpaths.add(currentInputRealpath);

    if (outputFileAbsPath && currentInputRealpath === outputFileAbsPath)
      continue;
    if (absExcludedRealpathsSet.has(currentInputRealpath)) continue;

    let isInsideExcludedDir = false;
    for (const excludedDirRp of absExcludedDirsForPruningSet) {
      if (currentInputRealpath.startsWith(excludedDirRp + path.sep)) {
        isInsideExcludedDir = true;
        break;
      }
    }
    if (isInsideExcludedDir) continue;

    if (!fs.existsSync(currentInputRealpath)) {
      console.warn(
        `  Warning: Input path '${inclPathRaw}' not found. Skipping.`
      );
      continue;
    }

    try {
      const inclStat = await fs.promises.stat(currentInputRealpath); // Use realpath for stat
      if (inclStat.isFile()) {
        candidateFileRealpaths.add(currentInputRealpath);
      } else if (inclStat.isDirectory()) {
        const queue = [currentInputRealpath]; // Start queue with the directory itself

        while (queue.length > 0) {
          const currentItemPath = queue.shift();
          if (!currentItemPath) continue;

          const currentItemAbsPath = path.resolve(currentItemPath); // Should be absolute
          const currentItemRealPath = fs.existsSync(currentItemAbsPath)
            ? fs.realpathSync(currentItemAbsPath)
            : currentItemAbsPath;

          if (outputFileAbsPath && currentItemRealPath === outputFileAbsPath)
            continue;
          if (absExcludedRealpathsSet.has(currentItemRealPath)) continue;

          let isInsideExcludedDirWalk = false;
          for (const excludedDirRp of absExcludedDirsForPruningSet) {
            if (currentItemRealPath.startsWith(excludedDirRp + path.sep)) {
              isInsideExcludedDirWalk = true;
              break;
            }
          }
          if (isInsideExcludedDirWalk) continue;

          if (!fs.existsSync(currentItemRealPath)) continue; // Skip if path vanished

          try {
            const itemStat = await fs.promises.stat(currentItemRealPath);
            if (itemStat.isFile()) {
              candidateFileRealpaths.add(currentItemRealPath);
            } else if (itemStat.isDirectory()) {
              if (!absExcludedDirsForPruningSet.has(currentItemRealPath)) {
                // Check real path of dir
                const subItems = await fs.promises.readdir(currentItemRealPath);
                subItems.forEach((subItemName) =>
                  queue.push(path.join(currentItemRealPath, subItemName))
                );
              }
            }
          } catch (e) {
            /* ignore files that can't be stat'd during walk */
          }
        }
      }
    } catch (e) {
      console.warn(
        `  Warning: Input path '${inclPathRaw}' issue. Skipping. ${e.message}`
      );
    }
  }
  return Array.from(candidateFileRealpaths).sort();
}

/**
 * Creates a bundle string from include/exclude paths (Node.js specific).
 * @param {Object} params
 * @param {string[]} params.includePaths - Raw paths to include.
 * @param {string[]} params.excludePaths - Raw paths to exclude.
 * @param {boolean} params.forceBase64 - Force Base64 encoding.
 * @param {string} [params.outputFileAbsPath] - For self-exclusion if writing to disk.
 * @param {string} [params.baseDirForRelpath] - Optional base directory for relative paths.
 * @returns {Promise<{bundleString: string, formatDescription: string, filesAdded: number}>}
 */
async function bundleFromPathsNode({
  includePaths,
  excludePaths,
  forceBase64,
  outputFileAbsPath, // Note: this is absolute real path
  baseDirForRelpath,
}) {
  const finalAbsPathsToBundle = await getFinalPathsToProcessNode(
    includePaths,
    excludePaths,
    outputFileAbsPath // outputFileAbsPath here is used for self-exclusion
  );

  if (finalAbsPathsToBundle.length === 0) {
    return {
      bundleString: "",
      formatDescription: "No files selected",
      filesAdded: 0,
    };
  }

  let commonAncestor;
  if (baseDirForRelpath) {
    commonAncestor = fs.existsSync(baseDirForRelpath)
      ? fs.realpathSync(path.resolve(baseDirForRelpath))
      : path.resolve(baseDirForRelpath);
  } else {
    const topLevelInputsForAncestor = includePaths.map((p) =>
      fs.existsSync(path.resolve(p))
        ? fs.realpathSync(path.resolve(p))
        : path.resolve(p)
    );
    commonAncestor = findCommonAncestor(topLevelInputsForAncestor);
  }

  const { fileObjects, anyNonUtf8Found } =
    await prepareFileObjectsFromPathsNode(
      finalAbsPathsToBundle,
      commonAncestor
    );

  if (fileObjects.length === 0) {
    return {
      bundleString: "",
      formatDescription: "No files successfully processed",
      filesAdded: 0,
    };
  }

  const { bundleString, formatDescription } = performBundling(
    fileObjects,
    forceBase64,
    anyNonUtf8Found
  );
  return { bundleString, formatDescription, filesAdded: fileObjects.length };
}

/**
 * @typedef {Object} BrowserFileObject
 * @property {string} relativePath - Relative path of the file (e.g., from File.webkitRelativePath).
 * @property {Uint8Array} contentBytes - File content as Uint8Array.
 * @property {boolean} isUtf8 - Whether the content is UTF-8.
 */

/**
 * Core bundling logic, suitable for browser use if file data is prepared.
 * @param {Array<BrowserFileObject>} filesData - Array of objects.
 * @param {boolean} forceBase64 - Whether to force Base64 for the entire bundle.
 * @returns {Promise<{bundleString: string, formatDescription: string}>}
 */
async function bundleToString(filesData, forceBase64) {
  let anyNonUtf8 = false;
  const processedFileObjects = filesData.map((f) => {
    // isUtf8 should already be on BrowserFileObject if prepared by bundleFromBrowser
    if (!f.isUtf8) anyNonUtf8 = true;
    return {
      // Adapt to structure performBundling expects
      relativePath: f.relativePath,
      contentBytes: Buffer.from(f.contentBytes), // Convert Uint8Array to Buffer for performBundling
      isUtf8: f.isUtf8,
    };
  });

  return performBundling(processedFileObjects, forceBase64, anyNonUtf8);
}

/**
 * Helper to read files from browser input (FileList or DirectoryHandle).
 * @param {FileList|FileSystemDirectoryHandle|File[]} input - User selected files/directory.
 * @returns {Promise<Array<BrowserFileObject>>}
 */
async function readFilesFromBrowserInput(input) {
  const filesData = [];

  async function processFile(file, relativePathOverride = null) {
    // Use webkitRelativePath if available and non-empty, otherwise fall back to name.
    // This is crucial for directory uploads.
    const relativePath =
      relativePathOverride ||
      (file.webkitRelativePath && file.webkitRelativePath.trim() !== ""
        ? file.webkitRelativePath
        : file.name);
    const contentBytes = new Uint8Array(await file.arrayBuffer());
    const isUtf8 = isLikelyUtf8(contentBytes);
    filesData.push({
      relativePath: relativePath.split(path.sep).join("/"), // Normalize path separators
      contentBytes,
      isUtf8,
    });
  }

  if (input instanceof FileList || Array.isArray(input)) {
    for (const file of Array.from(input)) {
      await processFile(file);
    }
  } else if (
    typeof input === "object" &&
    input !== null &&
    (typeof input.getEntries === "function" ||
      typeof input.values === "function") && // Check for FileSystemDirectoryHandle
    typeof input.kind === "string" &&
    input.kind === "directory"
  ) {
    async function processDirectory(dirHandle, currentPath = "") {
      for await (const entry of dirHandle.values()) {
        const entryPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name;
        if (entry.kind === "file") {
          const file = await entry.getFile();
          await processFile(file, entryPath); // Pass full relative path
        } else if (entry.kind === "directory") {
          await processDirectory(entry, entryPath);
        }
      }
    }
    await processDirectory(input);
  } else {
    throw new Error(
      "Unsupported input type for bundleFromBrowser. Expected FileList, FileSystemDirectoryHandle, or Array of Files."
    );
  }
  return filesData;
}

/**
 * Creates a bundle string from browser inputs (FileList, DirectoryHandle, or Array of Files).
 * @param {FileList|FileSystemDirectoryHandle|File[]} browserInput - User selected files/directory.
 * @param {boolean} forceBase64 - Force Base64 encoding for all files.
 * @returns {Promise<{bundleString: string, formatDescription: string, filesAdded: number}>}
 */
async function bundleFromBrowser(browserInput, forceBase64) {
  const filesData = await readFilesFromBrowserInput(browserInput);
  if (filesData.length === 0) {
    return {
      bundleString: "",
      formatDescription: "No files provided or read from browser input",
      filesAdded: 0,
    };
  }
  // filesData elements are already BrowserFileObject type
  const { bundleString, formatDescription } = await bundleToString(
    filesData,
    forceBase64
  );
  return { bundleString, formatDescription, filesAdded: filesData.length };
}

function parseCliArgs(argv) {
  // Manual CLI argument parsing. For more complex needs, a library like yargs would be beneficial.
  const args = {
    paths: [],
    output: DEFAULT_OUTPUT_FILENAME,
    exclude: [],
    forceB64: false,
    help: false,
  };
  const cliArgs = argv.slice(2);
  let i = 0;
  while (i < cliArgs.length) {
    const arg = cliArgs[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      break;
    } else if (arg === "-o" || arg === "--output") {
      if (i + 1 < cliArgs.length && !cliArgs[i + 1].startsWith("-")) {
        args.output = cliArgs[i + 1];
        i++;
      } else {
        throw new Error(`Argument ${arg} requires a value.`);
      }
    } else if (arg === "-x" || arg === "--exclude") {
      if (i + 1 < cliArgs.length && !cliArgs[i + 1].startsWith("-")) {
        args.exclude.push(cliArgs[i + 1]);
        i++;
      } else {
        throw new Error(`Argument ${arg} requires a value.`);
      }
    } else if (arg === "--force-b64") {
      args.forceB64 = true;
    } else if (!arg.startsWith("-")) {
      args.paths.push(arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
    i++;
  }
  if (args.paths.length === 0 && !args.help) {
    throw new Error("At least one PATH argument is required.");
  }
  return args;
}

function printCliHelp() {
  console.log(`cats.js : Bundles project files into a single text artifact for LLMs.

Syntax: node cats.js [PATH_TO_INCLUDE_1] [PATH_TO_INCLUDE_2...] [options]

Key Options:
  paths                     One or more files or directories to include. (Required)
  -o BUNDLE_FILE, --output BUNDLE_FILE
                            Name of the output bundle (default: ${DEFAULT_OUTPUT_FILENAME}).
  -x EXCLUDE_PATH, --exclude EXCLUDE_PATH
                            Path (file or directory) to exclude. Use multiple times.
  --force-b64               Force Base64 encoding for all files.
  -h, --help                Show this help message and exit.

Example: node cats.js ./src ./docs -x ./src/tests -o my_project.bundle`);
}

async function mainCli() {
  try {
    const args = parseCliArgs(process.argv);

    if (args.help) {
      printCliHelp();
      process.exit(0);
    }

    const absOutputFileRealPath = fs.existsSync(path.resolve(args.output))
      ? fs.realpathSync(path.resolve(args.output))
      : path.resolve(args.output);

    console.log("Phase 1: Collecting and filtering files...");
    const { bundleString, formatDescription, filesAdded } =
      await bundleFromPathsNode({
        includePaths: args.paths,
        excludePaths: args.exclude,
        forceBase64: args.forceB64,
        outputFileAbsPath: absOutputFileRealPath, // Used for self-exclusion
      });

    if (filesAdded === 0) {
      console.log(
        `No files selected for bundling. ${formatDescription}. Exiting.`
      );
      return;
    }

    // Determine base directory for display based on original inputs
    const inputRealPathsForDisplay = args.paths.map((p) =>
      fs.existsSync(path.resolve(p))
        ? fs.realpathSync(path.resolve(p))
        : path.resolve(p)
    );
    const commonAncestorForRelPathsDisplay = findCommonAncestor(
      inputRealPathsForDisplay
    );

    console.log(
      `  Base directory for relative paths in bundle: ${commonAncestorForRelPathsDisplay}`
    );
    console.log(
      `\nPhase 2: Writing bundle to '${args.output}'...` // Use user-provided name for display
    );
    console.log(`  Bundle Format: ${formatDescription}`);

    const outputParentDir = path.dirname(absOutputFileRealPath); // Use real path for mkdir
    if (outputParentDir && !fs.existsSync(outputParentDir)) {
      await fs.promises.mkdir(outputParentDir, { recursive: true });
    }
    await fs.promises.writeFile(absOutputFileRealPath, bundleString, {
      // Use real path for write
      encoding: DEFAULT_ENCODING,
    });

    console.log(`\nBundle created successfully: '${args.output}'`);
    console.log(`  Files added: ${filesAdded}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (
      error.message.includes("PATH argument is required") ||
      error.message.includes("Unknown option") ||
      error.message.includes("requires a value")
    ) {
      printCliHelp();
    }
    process.exit(1);
  }
}

module.exports = {
  bundleToString,
  bundleFromBrowser,
  bundleFromPathsNode,
  // Expose helpers if considered part of the public library API
  // isLikelyUtf8, generateBundleRelativePath, findCommonAncestor, performBundling
};

if (require.main === module) {
  mainCli();
}
