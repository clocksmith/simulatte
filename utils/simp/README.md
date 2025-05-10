# SIMP: Small Instruction Modules PROS (Programmatic Routines Operating SIMP)

SIMP is a collection of simple, standalone command-line utilities (for PROS?) designed as Small Instruction Modules. Each script serves a distinct, basic purpose.

---

## Utilities

Below is a list of the available utilities within the SIMP collection. Each is a Python script designed for a specific task.

### 1. Base64 CLI (`b64cli.py`)

Performs manual Base64 encoding or decoding of files without using Python's built-in `base64` module. Useful for understanding the Base64 algorithm or when the standard library module is not available/desired.

**Usage Examples:**

- Encode a file:
  ```bash
  python b64cli.py enco myfile.dat -o myfile.dat.b64
  ```
- Decode a Base64 file:
  ```bash
  python b64cli.py deco myfile.dat.b64 -o myfile.dat.decoded
  ```
- Encode without line wrapping:
  ```bash
  python b64cli.py enco largefile.bin --no-wrap
  ```

---

### 2. Decomment (`decomment.py`)

Removes comments from files containing mixed HTML, CSS, and JavaScript code. It handles HTML comments (`<!-- ... -->`), CSS/JS multi-line comments (`/* ... */`), and JS single-line comments (`// ...`).

**Usage Example:**

- Remove comments from `source.html` and save to `cleaned.html`:
  ```bash
  python decomment.py source.html cleaned.html
  ```

_Note: Single-line comment removal (`//`) is regex-based and might affect URLs or strings containing `//`. For highly complex or critical JS, a more sophisticated parser might be needed._

---

### 3. Shell Inspector (`whosh.py`)

Provides information about the current shell environment. It attempts to detect the shell type (Bash, Zsh, etc.), lists common shell configuration files found in your home directory, and prints a reminder of typical startup file load orders.

**Usage Example:**

- Run the inspector:
  ```bash
  python whosh.py
  ```
  _(Output will be printed to the console.)_

---

### 4. Text to Tagged HTML (`txt2tags.py`)

Converts a plain text file into an HTML document. In the output HTML, each character is wrapped in `<x-x>` tags, words in `<y-y>` tags, and lines in `<z-z>` tags. Line breaks from the input text are rendered as `<br />` elements. The generated HTML includes links to `style.css` and `main.js` for further customization.

**Usage Example:**

- Convert `input.txt` to `output.html`:
  ```bash
  python txt2tags.py input.txt -o output.html --title "My Tagged Document"
  ```

_Note: The tags `<x-x>`, `<y-y>`, and `<z-z>` are non-standard HTML. They are preserved from the original script's intent and may require custom CSS for styling or JavaScript for interactivity (e.g., if they are intended as custom elements)._

---

These utilities are designed for simplicity and specific use cases.
