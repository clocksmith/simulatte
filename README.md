# Simulatte

an n-gram and anagram collective
created for mages who like games

neural net logic
lucent argil net
lure cent lining
ruling net lance

live code
evil deco
voice led
cove idle
video cel
oiled vec
dice love
lice dove

## Cats and Dogs

`cats.py` and `dogs.py` are command-line utilities designed to facilitate interaction with Large Language Models (LLMs) by managing entire directory structures as single text artifacts.

**The Core Workflow:**

1.  **`cats.py` (Concatenate):** This script recursively walks through a specified directory (`<source_dir>`). It reads each file, encodes its content using Base64 (to safely handle binary data like images or executables), and appends it to a single output text file (default: `cats_output.txt`). Each file's content is wrapped in unique markers (`--- CATS_START_FILE: path/to/file.ext ---` and `--- CATS_END_FILE ---`) that store its original relative path.

    - **Purpose for LLMs:** This allows you to package an entire project or a significant portion of it into a single text block. You can then easily copy and paste this block into an LLM's context window, giving the model a holistic view of the codebase or file structure it needs to work with.

2.  **LLM Interaction:** You provide the content of the `cats.py` output file to your chosen LLM. You can then instruct the LLM to perform large-scale changes, such as refactoring code across multiple files, adding documentation, translating content, generating boilerplate, or any other task that benefits from broad context. The LLM _should_ ideally modify the content _between_ the markers while preserving the markers themselves.

3.  **`dogs.py` (Distribute):** This script takes the (potentially modified) output file from `cats.py` (or the LLM) and a target directory (`<target_dir>`). It parses the text, identifies the file markers, decodes the Base64 content for each file, and reconstructs the original directory structure and files within the specified `<target_dir>`.
    - **Purpose for LLMs:** After the LLM has processed the bundled text and made modifications, `dogs.py` applies these changes back to a real file system structure. It effectively "unpacks" the LLM's output into usable project files. It includes safety checks and prompts for overwriting existing files.

**Benefits:**

- Provides LLMs with comprehensive context beyond single files.
- Enables instructing LLMs to perform project-wide modifications.
- Streamlines the process of applying LLM-generated changes back to the file system.
- Handles binary files safely through Base64 encoding.

### Example Use Case: Project-Wide Refactoring

Let's say you have a Python project in a directory named `my_cool_project` and you want an LLM to rename a function `calculate_stuff` to `perform_calculation` everywhere it's used.

1.  **Bundle the project:**

    ```bash
    # Create a single text file containing the whole project
    python3 cats.py my_cool_project -o project_bundle.cats
    ```

2.  **Interact with the LLM:**

    - Copy the _entire_ content of `project_bundle.cats`.
    - Paste it into your LLM interface.
    - Provide a prompt like:
      ```
      "Please analyze the following project files. Rename the function 'calculate_stuff' to 'perform_calculation' everywhere it is defined and called. Ensure you update all relevant files. Please keep the file markers (--- CATS_START_FILE: ... --- and --- CATS_END_FILE ---) exactly as they are, only modifying the code content between them."
      ```

3.  **Save the LLM's Output:**

    - Copy the _entire_ response from the LLM, which should be the modified bundle.
    - Save this response to a new file, e.g., `modified_bundle.cats`.
    - _Crucially, visually inspect the beginning and end of the LLM output to ensure it didn't truncate the data or mangle the markers significantly._

4.  **Apply the changes:**

    ```bash
    # Create a new directory to safely unpack the changes
    mkdir refactored_project

    # Run dogs.py to write the modified files
    python3 dogs.py modified_bundle.cats refactored_project
    ```

    - `dogs.py` will read `modified_bundle.cats` and recreate the file structure inside `refactored_project` with the changes applied by the LLM. It will ask for confirmation if it needs to overwrite any files (e.g., if you run it twice into the same directory). You can use `python3 dogs.py modified_bundle.cats refactored_project -f` to force overwrites.

5.  **Review:**
    - Use tools like `diff -r my_cool_project refactored_project` or a Git diff to review the changes the LLM made before fully integrating them.

This simple workflow transforms `cats.py` and `dogs.py` into powerful tools for leveraging LLMs for complex, multi-file tasks on your projects.
