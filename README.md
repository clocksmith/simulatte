# Simulatte ♁

an n-gram and anagram collective
created for games who like mages
neural net logic live code games
games lucent argil net evil deco
mages voice led lure cent lining
video cel ruling net lance mages
collective game logic and models
magic agent models collaborating

## /36 Dreamer Tool Factory ⛮

Dreamer Tool Factory (DTF), also conceptualized as a Dynamic Tool Factory, embodies a generative and iterative process hinted at by its recursive acronym: **D**esign **R**adiates **E**legant **A**nd **M**odular **E**lements **R**ECOMBINED **R**ecursive **E**lement **C**reator **O**ptimized **M**eticulously **B**y **I**nfinite **N**etwork **E**volution. It is a browser-based application leveraging Large Language Models (LLMs), specifically the Gemini API, to dynamically create, manage, and execute JavaScript tools based on user descriptions.

### Core Capabilities ★

- **LLM Tool Generation:** Users describe desired functionality in natural language; the system prompts the LLM to generate both a formal MCP tool definition and the corresponding JavaScript code.
- **Tool Library:** Generated tools are stored in `localStorage` and displayed in a searchable, sortable library within the UI.
- **Code Inspection:** Allows viewing the generated MCP JSON definition and JavaScript source code for each tool.
- **In-Browser Execution:** Runs generated JavaScript tools with user-provided arguments via dynamically generated forms within a sandboxed environment.
- **Iteration:** Facilitates tool refinement by allowing users to edit the original request and regenerate the tool.
- **State Management:** Manages API keys via `sessionStorage` and persists the tool library state via `localStorage`, with export/import functionality.

### Architecture Overview ⛫

The application utilizes a modular vanilla JavaScript structure. The `boot.js` script acts as the entry point, loading configuration and initializing core modules. User interactions are handled by `UIManager.js`, which dynamically renders the interface, including the `tool-card.wc.js` Web Component for displaying individual tools, and listens for user actions like searching, sorting, creating, editing, or executing tools.

The core generation process is managed by `CycleLogic.js`. It takes the user's request, constructs a detailed prompt using a template, and interacts with the Gemini API via `ApiClient.js`. The response is then processed, validated, and the resulting tool definition (potentially converted by `MCPConverter.js`) and implementation are saved using `StorageModule.js` and registered with `StateManager.js`. Tool execution requests are passed to `ToolRunner.js`, which executes the JavaScript code within a controlled environment, returning results or errors back to the UI manager for display.

### Examples & Use Cases ☞

Dreamer supports various workflows:

1.  **Simple Calculation Tool:**

    - **User Request:** "Make a tool `calcVat` that takes a numeric `netAmount` and a `vatRate` (e.g., 0.19 for 19%) and returns the `grossAmount`."
    - **LLM Generates:** An MCP definition specifying `netAmount` (number, required) and `vatRate` (number, required), and JS code like:
      ```javascript
      async function run({ netAmount, vatRate }) {
        if (typeof netAmount !== "number" || typeof vatRate !== "number") {
          return { success: false, error: "Both inputs must be numbers." };
        }
        const grossAmount = netAmount * (1 + vatRate);
        return { success: true, data: { grossAmount: grossAmount } };
      }
      ```
    - **Execution:** The tool card displays two number inputs. Entering `100` and `0.19` yields a result like `{"success":true,"data":{"grossAmount":119}}`.

2.  **Text Formatting Tool:**

    - **User Request:** "Create a tool `slugifyText` that takes a string `inputText` and returns a URL-friendly 'slug' (lowercase, spaces replaced with hyphens, non-alphanumeric characters removed)."
    - **LLM Generates:** MCP schema and JS implementation using string manipulation methods (`toLowerCase()`, `replace()`, etc.).
    - **Execution:** Paste "My Awesome Blog Post!" into the input, get `{"success":true,"data":{"slug":"my-awesome-blog-post"}}`.

3.  **Data Structuring Tool:**

    - **User Request:** "Generate a tool `parseCsvLine` that takes a comma-separated string `csvLine` and an array of strings `headers`, returning an object where keys are headers and values are corresponding CSV fields."
    - **LLM Generates:** MCP schema (input: `csvLine: string`, `headers: array`) and JS to split the line, handle potential quoting, and map values to headers.
    - **Execution:** Input `csvLine: "John Doe,35,New York"`, `headers: ["name", "age", "city"]`, get `{"success":true,"data":{"name":"John Doe","age":"35","city":"New York"}}`. (Note: Type conversion might be a further refinement request).

4.  **Chained Execution Example (Manual Workflow):**
    - **Tool 1 Request:** "Create a tool `extractEmailsFromString` that takes a block of text `sourceText` and returns an array `emails` containing all valid email addresses found."
    - **Tool 2 Request:** "Create a tool `createMailtoLinks` that takes an array of strings `emailList` and returns an array `mailtoLinks` where each element is a 'mailto:' link for the corresponding email."
    - **Execution:**
      1.  Execute `extractEmailsFromString` with some text containing emails. Copy the resulting `data.emails` array (e.g., `["test@example.com", "another@domain.net"]`).
      2.  Execute `createMailtoLinks`, pasting the copied array as the value for the `emailList` argument.
      3.  Receive the result, e.g., `{"success":true,"data":{"mailtoLinks":["mailto:test@example.com","mailto:another@domain.net"]}}`.

These examples illustrate how Dreamer can be used to quickly build and test functional code snippets generated by an LLM, potentially composing them (manually for now) to achieve more complex results.

## Cats & Dogs ♛ ♚

These utilities, found in the `utils/` directory, help manage project files for interaction with Large Language Models (LLMs). `cats.py` bundles files into a single text artifact, and `dogs.py` extracts them back, hopefully without making too much of a mess.

### The Core Workflow ☰

1.  **`cats.py` (Concatenate):** This script recursively walks through specified directories or processes individual files, effectively _herding_ their contents. By default, it reads files as binary, encodes them using Base64 (safe for all file types), and writes this encoded text to the output file. Alternatively, using the `--no-base64` flag, it attempts to read files as raw UTF-8 text. Each file's content is wrapped in markers storing its relative path:

    ```
    --- CATS_START_FILE: path/to/file.ext ---
    [Base64 Encoded String OR Raw UTF-8 Text]
    --- CATS_END_FILE ---
    ```

    A header comment (`# Base64 Encoded: True/False`) is added to indicate the mode used. Non-UTF-8 files are skipped with a warning when using `--no-base64`.

    - **Purpose for LLMs:** Packages a project into a single text block for easy pasting into an LLM's context, giving the model a holistic view.

2.  **LLM Interaction:** Feed the `cats.py` output to your LLM, letting it _chew_ on the structure. Instruct it to perform changes (refactoring, documentation, etc.), emphasizing that it **must** preserve the `--- CATS_START_FILE: ... ---` and `--- CATS_END_FILE ---` markers exactly, modifying only the content between them.

3.  **`dogs.py` (Distribute/Extract):** This script takes the concatenated file (original or LLM-modified) and a target directory. It reads the `# Base64 Encoded:` header to determine the format, parses the markers, decodes (if Base64) or encodes (if raw text) the content appropriately, and reconstructs the files and directories, essentially _fetching_ them back into a usable structure.

    - **Purpose for LLMs:** Applies the LLM's multi-file changes back to a filesystem. It includes safety checks and prompts before overwriting existing files (to avoid overwriting the wrong chew toy).

### Benefits ⛉

- Provides LLMs with comprehensive, multi-file context.
- Enables project-wide modifications via LLMs.
- Streamlines applying LLM changes back to the file system, like a well-trained retriever.
- Handles binary files safely via Base64 (default) or attempts raw text for UTF-8 files.

### Usage ✍

_(Run scripts from the project root directory)_

#### `cats.py` (Concatenator)

Combines specified input files and directories into one output file.

**Syntax:**

```bash
python utils/cats.py [options] <input_path1> [input_path2...]
```

**Arguments:**

- `<input_paths>`: One or more file paths or directory paths to include.
- `-o, --output`: Name for the concatenated output file (default: `cats_output.txt`).
- `--no-base64`: (Optional) Store content as raw text (UTF-8) instead of Base64. Files not decodable as UTF-8 will be skipped.

**Examples:**

☞ Concatenate folder 'src' and file 'config.json' into 'output.cat' using Base64 (default):

```bash
python utils/cats.py src config.json -o output.cat
```

☞ Concatenate text files from 'docs' folder as raw text into 'docs_raw.cat':

```bash
python utils/cats.py --no-base64 docs -o docs_raw.cat
```

#### `dogs.py` (Extractor)

Extracts files from a concatenated file created by `cats.py`.

**Syntax:**

```bash
python utils/dogs.py [options] <input_file> <target_directory>
```

**Arguments:**

- `<input_file>`: The concatenated file created by `cats.py`.
- `<target_directory>`: The directory where the original file structure will be recreated.
- `-f, --force`: (Optional) Force overwrite of existing files without prompting.

**Example:**

☞ Extract files from 'output.cat' into the 'extracted_files' directory:

```bash
python utils/dogs.py output.cat extracted_files
```

☞ Extract and force overwrite:

```bash
python utils/dogs.py -f output.cat extracted_files
```

### Encoding Handling ⛭

- **`cats.py` Output:** Includes a header line (`# Base64 Encoded: True` or `# Base64 Encoded: False`) indicating the format used for the file contents.
  - **Default (Base64):** Reads binary, writes Base64 text. Safe for all files.
  - **`--no-base64`:** Reads binary, attempts UTF-8 decode, writes raw text. Skips non-UTF-8 files.
- **`dogs.py` Input:** Reads the header line to automatically determine whether to Base64 decode the content or UTF-8 encode it before writing the output file (always written in binary mode for consistency).

### Base64 vs. Raw Text: Pros and Cons ⚖

**Base64 Encoding (Default in `cats.py`)**

- **Pros:**
  - ⚐ **Binary Safe:** Reliably handles _any_ file type (images, executables, etc.).
  - ⚐ **Robust:** Ensures the concatenated file itself is valid text without problematic characters.
- **Cons:**
  - ⛒ **Size Increase:** Increases file size by approximately 33%.
  - ⛒ **Readability:** Bundle content is not directly human-readable.
  - ⛒ **Processing:** Requires encoding/decoding steps.

**Raw Text (`--no-base64` flag in `cats.py`)**

- **Pros:**
  - ⚐ **Readability:** Human-readable bundle if all sources are UTF-8 text.
  - ⚐ **Size Efficiency:** No size increase for text files.
- **Cons:**
  - ⛒ **Binary Unsafe:** Cannot handle non-text files; they will be skipped by `cats.py`.
  - ⛒ **Encoding Limitation:** Assumes all included files _are_ valid UTF-8. Other text encodings will fail.
  - ⛒ **Potential Issues:** Rare chance of marker sequences appearing within raw code, though less likely with the chosen markers.

### Recommendation ❥

Use the **default (Base64)** mode in `cats.py` if:

- Your project contains **mixed file types** (code, images, data files, etc.).
- You prioritize **robustness** and ensuring all files are included.
- Guaranteed data integrity is the _top dog_.

Use the **`--no-base64`** option only if:

- You are **certain** all files to be included are **UTF-8 plain text**.
- **Human readability** of the bundled `cats.py` output is a primary requirement.
- You accept that any **non-UTF-8 files will be skipped**.

### Example Use Case: Project-Wide Refactoring 🛠

Let's refactor a function `oldName` to `newName` across `my_project`.

1.  **Bundle the project** (using default Base64 for safety):
    ```bash
    python utils/cats.py my_project -o project_bundle.cats
    ```
2.  **Interact with the LLM:**
    - Copy the content of `project_bundle.cats`.
    - Paste into the LLM.
    - Prompt:
      > "Analyze the project files included between the markers below. Refactor the function named 'oldName' to 'newName' everywhere it appears. Update all calls and definitions. Return the complete modified content, preserving the markers (`--- CATS_START_FILE: ... ---` and `--- CATS_END_FILE ---`) and the content format between them."
3.  **Save LLM Output:**
    - Copy the LLM's full response.
    - Save to `modified_bundle.cats`.
    - Briefly check that markers look intact.
4.  **Apply Changes:**
    ```bash
    mkdir refactored_project
    python utils/dogs.py modified_bundle.cats refactored_project
    ```
5.  **Review:**
    - Use `diff -r my_project refactored_project` or Git tools to review changes before merging, ensuring the LLM didn't _bury_ any critical code.
