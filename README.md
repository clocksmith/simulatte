# Simulatte

an n-gram and anagram collective
created for mages who like games

neural net logic
lucent argil net
lure cent lining
ruling net lance

live code
evil deco
cove idle
voice led
oiled vec
video cel
dice love
dove lice

## Cats & Dogs File Management Utility ⚙

`cats.py` and `dogs.py` are command-line utilities designed to facilitate interaction with Large Language Models (LLMs) by managing entire directory structures as single text artifacts, hopefully without making too much of a mess.

### The Core Workflow ☰

1.  **`cats.py` (Concatenate):** This script recursively walks through a specified directory (`<source_dir>`) or processes specified files, effectively _herding_ all the file contents into one place. It reads each file, encodes its content (using Base64 by default, or optionally raw text), and appends it to a single output text file. Each file's content is wrapped in unique markers (`--- CATS_START_FILE: path/to/file.ext ---` and `--- CATS_END_FILE ---`) that store its original relative path.

    - **Purpose for LLMs:** This allows you to package an entire project into a single text block. You can then easily copy and paste this block into an LLM's context window, giving the model a holistic view of the codebase it needs to work with.

2.  **LLM Interaction:** You provide the content of the `cats.py` output file to your chosen LLM, letting it _chew_ on the entire project structure. You can then instruct the LLM to perform large-scale changes, such as refactoring code, adding documentation, or any other task that benefits from broad context. The LLM _should_ ideally modify the content _between_ the markers while preserving the markers themselves.

3.  **`dogs.py` (Distribute/Extract):** This script takes the (potentially modified) output file from `cats.py` (or the LLM) and a target directory (`<target_dir>`). It parses the text, identifies the file markers, decodes/processes the content for each file (auto-detecting Base64 or raw text), and reconstructs the original directory structure and files within the specified `<target_dir>`, essentially _fetching_ the files back into a usable format.

    - **Purpose for LLMs:** After the LLM has processed the bundled text, `dogs.py` applies these changes back to a real file system structure. It includes safety checks and prompts for overwriting existing files (so you don't accidentally overwrite the wrong chew toy).

### Benefits ⛉

- Provides LLMs with comprehensive context beyond single files.
- Enables instructing LLMs to perform project-wide modifications.
- Streamlines applying LLM-generated changes back to the file system, like a well-trained retriever.
- Handles binary files safely through Base64 encoding (default).

### Usage ✍

#### `cats.py` (Concatenator)

Combines specified input files and directories into one output file.

**Syntax:**

```bash
python cats.py [options] <input_path1> [input_path2...]
```

````

**Arguments:**

- `<input_paths>`: One or more file paths or directory paths to include in the output.
- `-o, --output`: Specifies the name for the concatenated output file (default: `cats_output.txt`).
- `--no-base64`: (Optional) Store content as raw text (UTF-8) instead of Base64 encoding. See "Encoding Options" below.

**Examples:**

☞ Concatenate folder 'src' and file 'config.json' into 'output.cat' using Base64 (default):

```bash
python cats.py src config.json -o output.cat
```

☞ Concatenate only text files from 'docs' folder as raw text into 'docs_raw.cat':

```bash
python cats.py --no-base64 docs -o docs_raw.cat
```

#### `dogs.py` (Extractor)

Extracts files from a concatenated file created by `cats.py`.

**Syntax:**

```bash
python dogs.py [options] <input_file> <target_directory>
```

**Arguments:**

- `<input_file>`: The concatenated file created by `cats.py`.
- `<target_directory>`: The directory where the original file structure will be recreated.
- `-f, --force`: (Optional) Force overwrite of existing files in the target directory without prompting.

**Example:**

☞ Extract files from 'output.cat' into the 'extracted_files' directory:

```bash
python dogs.py output.cat extracted_files
```

☞ Extract and force overwrite:

```bash
python dogs.py -f output.cat extracted_files
```

### Encoding Options (`cats.py`) ⛭

`cats.py` offers two ways to store file content within the concatenated output:

1.  **Base64 Encoding (Default):**

    - File content is read as binary data.
    - The binary data is encoded using Base64.
    - The resulting Base64 text is stored in the output file between markers.

2.  **Raw Text (`--no-base64` flag):**
    - File content is read as binary data.
    - The script attempts to decode the binary data as UTF-8 text.
    - If successful, the raw UTF-8 text is stored directly.
    - If decoding fails (likely binary or different encoding), the file is skipped with a warning.

`dogs.py` automatically detects whether the content for each file is Base64 encoded or raw text and processes it accordingly.

### Base64 vs. Raw Text: Pros and Cons ⚖

Choosing between Base64 (default) and raw text (`--no-base64`) involves trade-offs:

**Base64 Encoding:**

- **Pros:**
  - ⚐ Binary Safe: Reliably handles any file type.
  - ⚐ Robust: Ensures the concatenated file is valid text.
  - ⚐ Universal: Standard method for embedding binary data in text.
- **Cons:**
  - ⛒ Size Increase: Increases file size (~33%).
  - ⛒ Readability: Content is not human-readable without decoding.
  - ⛒ Processing Overhead: Requires encoding/decoding time.

**Raw Text (`--no-base64`):**

- **Pros:**
  - ⚐ Readability: Human-readable if source files are UTF-8 plain text.
  - ⚐ Size Efficiency: No overhead for text files.
  - ⚐ Simplicity (for Text): Easier concept for bundling plain text.
- **Cons:**
  - ⛒ Binary Unsafe: Cannot reliably handle binary files (skipped by `cats.py`).
  - ⛒ Encoding Limitation: Assumes all included text files are UTF-8.
  - ⛒ Extractor Complexity: Requires detection logic in `dogs.py`.

### Recommendation ❥

Use the **default Base64** encoding if:

- You need to bundle a mix of file types.
- You are unsure about file types or encodings.
- Robustness and guaranteed data integrity are the _top dog_.

Use the **`--no-base64`** option only if:

- You are certain all files are UTF-8 plain text.
- Human readability of the concatenated file is crucial.
- You accept that any non-UTF-8 files will be skipped.

### Example Use Case: Project-Wide Refactoring 🛠

Let's say you have a project in `my_cool_project` and want an LLM to rename a function `calculate_stuff` to `perform_calculation` everywhere.

1.  **Bundle the project** (using default Base64 for safety):
    ```bash
    # Create a single text file containing the whole project
    python cats.py my_cool_project -o project_bundle.cats
    ```
2.  **Interact with the LLM:**
    - Copy the entire content of `project_bundle.cats`.
    - Paste it into your LLM interface.
    - Provide a prompt like:
      > "Please analyze the following project files provided between the markers. Rename the function 'calculate_stuff' to 'perform_calculation' everywhere it is defined and called within these files. Ensure you update all relevant code sections. Please keep the file markers (`--- CATS_START_FILE: ... ---` and `--- CATS_END_FILE ---`) exactly as they are, only modifying the code content between them."
3.  **Save the LLM's Output:**
    - Copy the entire response from the LLM.
    - Save this response to a new file, e.g., `modified_bundle.cats`.
    - _Crucially_, visually inspect the LLM output to ensure it didn't truncate data or significantly mangle the markers.
4.  **Apply the changes:**

    ```bash
    # Create a new directory to safely unpack the changes
    mkdir refactored_project

    # Run dogs.py to write the modified files
    python dogs.py modified_bundle.cats refactored_project
    ```

    - `dogs.py` will recreate the file structure inside `refactored_project`. It will ask before overwriting files. Use `-f` to force overwrites (`python dogs.py -f modified_bundle.cats refactored_project`).

5.  **Review:**
    - Use tools like `diff -r my_cool_project refactored_project` or Git diff to review the changes and ensure the LLM didn't _bury_ any important code.
````
