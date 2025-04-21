# Cats & Dogs

## ▸▸ Overview

These utilities, found in the `utils/` directory, help manage project files for interaction with Large Language Models (LLMs). `cats.py` bundles files into a single text artifact, and `dogs.py` extracts them back.

## ▸▸ The Core Workflow

1.  **`cats.py` (Concatenate):**

    - Recursively walks through specified directories/files.
    - Reads file contents.
    - **Auto-Detects Format:** Checks if all input files are valid UTF-8 text.
      - If **all** are UTF-8 compatible: Stores content as raw text.
      - If **any** file is binary or non-UTF-8: Stores **all** file content as Base64 encoded text.
    - Writes content to the output file, wrapped in markers with relative paths:
      ```
      --- CATS_START_FILE: path/to/file.ext ---
      [Base64 Encoded String OR Raw UTF-8 Text]
      --- CATS_END_FILE ---
      ```
    - Adds a header comment (`# Format: ...`) indicating whether Base64 or Raw UTF-8 was used.
    - Provides options (`--force-encoding`) to override auto-detection.
    - **Purpose:** Packages a project into a single text block for LLMs, providing context.

2.  **LLM Interaction:**

    - Feed the `cats.py` output to an LLM.
    - Instruct the LLM to perform changes (refactoring, documentation, etc.).
    - **Crucially:** Emphasize that the LLM **must** preserve the `--- CATS_START_FILE: ... ---` and `--- CATS_END_FILE ---` markers exactly, only modifying the content _between_ them.

3.  **`dogs.py` (Extract):**
    - Takes the concatenated file (original or LLM-modified) and a target directory.
    - Reads the `# Format:` header to determine how to process content (Base64 decode or treat as UTF-8 text). Can be overridden with `--input-format`.
    - Parses the markers to find file boundaries and relative paths.
    - Decodes (if Base64) the content or encodes (if raw text) it back to bytes.
    - Reconstructs the original files and directory structure in the target directory.
    - Sanitizes extracted filenames (e.g., replaces `-` with `_`).
    - **Purpose:** Applies LLM's multi-file changes back to a filesystem structure.

## ▸▸ Benefits

- Provides LLMs with comprehensive, multi-file context.
- Enables project-wide modifications via LLMs.
- Streamlines applying LLM changes back to the file system.
- Handles binary files safely via Base64 (auto-detected when needed).
- Optimizes for raw text when all files are compatible for better readability and smaller size.

## ▸▸ Usage

_(Run scripts from the project root directory)_

### `cats.py` (Concatenator)

Combines specified input files and directories into one output file with auto-format detection.

**Syntax:**

```bash
python utils/cats.py [options] <input_path1> [input_path2...]
```

**Arguments:**

- `<input_paths>`: One or more file paths or directory paths to include.
- `-o, --output`: Output file path (default: `cats_out.bundle`).
- `--force-encoding {auto|b64|utf8}`: Override format detection.
  - `auto` (default): Detect if all UTF-8, else use Base64.
  - `b64`: Force Base64 for all files.
  - `utf8`: Force raw UTF-8 text (may fail for binary files).

**Examples:**

▸ Concatenate 'src' folder and 'config.json' into 'output.bundle' (auto-detect format):

```bash
python utils/cats.py src config.json -o output.bundle
```

▸ Force Base64 encoding for an image:

```bash
python utils/cats.py image.png --force-encoding b64 -o image.b64.bundle
```

▸ Force raw UTF-8 text for documentation files:

```bash
python utils/cats.py docs --force-encoding utf8 -o docs_raw.bundle
```

### `dogs.py` (Extractor)

Extracts files from a concatenated file created by `cats.py`.

**Syntax:**

```bash
python utils/dogs.py [options] [<input_file>] [<output_dir>]
```

**Arguments:**

- `<input_file>`: The concatenated file (default: `cats_out.bundle`).
- `<output_dir>`: Directory to extract into (default: current directory `.`).
- `--input-format {auto|b64|utf8}`: Override format detection based on the input file's header.

**Example:**

▸ Extract files from 'output.bundle' into 'extracted_project':

```bash
python utils/dogs.py output.bundle extracted_project
```

▸ Extract from default input 'cats_out.bundle' to current directory, forcing Base64 interpretation:

```bash
python utils/dogs.py --input-format b64
```

## ▸▸ Encoding Handling

- **`cats.py`:**
  - **Auto (Default):** Checks all input files. If any file fails UTF-8 decoding (using `chardet` and a fallback check), the _entire_ bundle uses Base64. Otherwise, it uses Raw UTF-8.
  - **`--force-encoding b64`:** Uses Base64 regardless of file content.
  - **`--force-encoding utf8`:** Attempts to use Raw UTF-8. Files that cannot be decoded as UTF-8 will likely cause errors or produce corrupted output in the bundle. **Use with caution.**
  - Outputs a header comment (`# Format: ...`) indicating the final mode used.
- **`dogs.py`:**
  - **Auto (Default):** Reads the `# Format:` header from the input bundle to determine whether to Base64 decode or treat as UTF-8.
  - **`--input-format`:** Overrides the header detection. Useful if the header is missing or incorrect.
  - Always writes extracted files in **binary mode** (`wb`) to preserve original line endings and handle binary data correctly after decoding.

## ▸▸ Auto-Detect vs. Forced Encoding

**Auto-Detection (Default in `cats.py`)**

- **Pros:**
  - Handles mixed file types automatically and safely (chooses Base64 if needed).
  - Uses more efficient raw text when possible.
- **Cons:**
  - Requires reading a portion of each file upfront for detection.
  - Relies on `chardet` and UTF-8 checks, which might occasionally misidentify encodings (though unlikely for common formats).

**Forced Base64 (`--force-encoding b64` in `cats.py`)**

- **Pros:**
  - Guaranteed safety for all file types.
  - Simple, no detection phase needed.
- **Cons:**
  - Larger output file size (~33% increase).
  - Bundle content is not human-readable.

**Forced Raw UTF-8 (`--force-encoding utf8` in `cats.py`)**

- **Pros:**
  - Human-readable bundle if sources are UTF-8 text.
  - Most size-efficient for text.
- **Cons:**
  - **Unsafe for binary files.** Will corrupt them or cause errors.
  - **Assumes UTF-8.** Will fail or corrupt files with different text encodings (e.g., Latin-1, UTF-16).
  - **Use only if absolutely certain all inputs are valid UTF-8 text.**

## ▸▸ Recommendation

Use **`auto` (default)** mode in `cats.py` for most cases. It provides the best balance of safety and efficiency.

Use `--force-encoding b64` if you absolutely need to guarantee every byte is preserved, even if it means a larger, less readable bundle.

Use `--force-encoding utf8` **only** if you are 100% sure all input files are UTF-8 text and readability of the bundle itself is paramount.

## ▸▸ Example Use Case: Project-Wide Refactoring

Refactor function `oldName` to `newName` across `my_project`:

1.  **Bundle the project** (using auto-detect):

    ```bash
    python utils/cats.py my_project -o project_bundle.cats
    ```

    _(Check the `# Format:` line in the output file to see if it used Base64 or Raw UTF-8)._

2.  **Interact with LLM:**

    - Copy content of `project_bundle.cats`.
    - Paste into LLM.
    - Prompt:
      > "Analyze the project files included between the markers below. The format is indicated by the '# Format:' header. Refactor the function named 'oldName' to 'newName' everywhere it appears. Update all calls and definitions. Return the complete modified content, preserving the header, the markers (`--- CATS_START_FILE: ... ---` and `--- CATS_END_FILE ---`) and the content format (Base64 or raw text) between them exactly."

3.  **Save LLM Output:**

    - Copy LLM's full response.
    - Save to `modified_bundle.cats`.
    - Briefly check markers and header.

4.  **Apply Changes:**

    ```bash
    mkdir refactored_project
    python utils/dogs.py modified_bundle.cats refactored_project
    ```

    _(dogs.py will automatically read the format header)._

5.  **Review:**
    - Use `diff -r my_project refactored_project` or Git tools to review changes.
