import sys
import os
import argparse
import base64
import re  # Using regex for more robust marker parsing

# Define markers (must match cats.py)
# Regex pattern accounts for potential whitespace variations around path
FILE_START_MARKER_REGEX = re.compile(r"--- CATS_START_FILE: (.*?) ---")
FILE_END_MARKER = "--- CATS_END_FILE ---"
ENCODING = "utf-8"  # Encoding for markers and paths


def extract_files(input_file_path, output_dir_path, force_overwrite=False):
    """
    Reads the concatenated file, extracts files based on markers,
    decodes base64 content, and recreates the file structure in the output directory.
    """
    extracted_files = 0
    skipped_files = 0

    print(f"Starting extraction from '{input_file_path}' into '{output_dir_path}'...")

    if not os.path.isfile(input_file_path):
        print(
            f"Error: Input file '{input_file_path}' not found or is not a file.",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        # Read the entire concatenated file
        with open(input_file_path, "r", encoding=ENCODING) as infile:
            content = infile.read()

    except Exception as e:
        print(
            f"Error: Could not read input file '{input_file_path}': {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Ensure the target output directory exists
    try:
        if not os.path.exists(output_dir_path):
            print(f"Creating target directory: '{output_dir_path}'")
            os.makedirs(output_dir_path, exist_ok=True)
        elif not os.path.isdir(output_dir_path):
            print(
                f"Error: Target path '{output_dir_path}' exists but is not a directory.",
                file=sys.stderr,
            )
            sys.exit(1)
    except OSError as e:
        print(
            f"Error: Could not create target directory '{output_dir_path}': {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Find all potential file blocks
    # Split content by the end marker first
    potential_blocks = content.split(f"\n{FILE_END_MARKER}\n")

    current_pos = 0
    for block in potential_blocks:
        if not block.strip():  # Skip empty blocks potentially created by split
            continue

        # Find the start marker within this block
        start_match = FILE_START_MARKER_REGEX.search(block)

        if start_match:
            relative_path = start_match.group(1).strip()
            # Content starts after the full start marker match
            start_marker_end_pos = start_match.end()
            # Need to handle potential newline after marker before content
            base64_content_raw = block[start_marker_end_pos:].strip()

            if not relative_path:
                print(
                    f"Warning: Found marker with empty path near character {current_pos}. Skipping.",
                    file=sys.stderr,
                )
                skipped_files += 1
                current_pos += len(block) + len(FILE_END_MARKER) + 2  # Approx update
                continue

            # Normalize the path (important for Windows/Linux compatibility)
            relative_path = os.path.normpath(relative_path)
            # Security check: prevent paths trying to escape the target directory
            if ".." in relative_path.split(os.path.sep):
                print(
                    f"Warning: Skipped potentially unsafe path '{relative_path}' containing '..'.",
                    file=sys.stderr,
                )
                skipped_files += 1
                current_pos += len(block) + len(FILE_END_MARKER) + 2
                continue

            full_output_path = os.path.join(output_dir_path, relative_path)
            output_file_dir = os.path.dirname(full_output_path)

            print(f"Found file: {relative_path}")

            # Confirmation for overwriting
            if os.path.exists(full_output_path) and not force_overwrite:
                try:
                    confirm = (
                        input(
                            f"  File '{full_output_path}' already exists. Overwrite? (y/N): "
                        )
                        .strip()
                        .lower()
                    )
                    if confirm != "y":
                        print(f"  Skipping overwrite for '{relative_path}'")
                        skipped_files += 1
                        current_pos += len(block) + len(FILE_END_MARKER) + 2
                        continue
                    else:
                        print(f"  Overwriting '{relative_path}'...")
                except (
                    EOFError
                ):  # Handle cases where input stream is closed (e.g., piping)
                    print(
                        "\n  Warning: Could not get confirmation (EOF). Skipping overwrite.",
                        file=sys.stderr,
                    )
                    skipped_files += 1
                    current_pos += len(block) + len(FILE_END_MARKER) + 2
                    continue

            try:
                # Ensure the specific directory for this file exists
                if not os.path.exists(output_file_dir):
                    os.makedirs(output_file_dir, exist_ok=True)

                # Decode base64 content
                binary_content = base64.b64decode(base64_content_raw.encode(ENCODING))

                # Write the actual file content as binary
                with open(full_output_path, "wb") as outfile:
                    outfile.write(binary_content)

                print(f"  Successfully extracted to: {full_output_path}")
                extracted_files += 1

            except base64.binascii.Error as e:
                print(
                    f"  Warning: Skipping file '{relative_path}' due to Base64 decode error: {e}",
                    file=sys.stderr,
                )
                skipped_files += 1
            except IOError as e:
                print(
                    f"  Warning: Skipping file '{relative_path}' due to write error: {e}",
                    file=sys.stderr,
                )
                skipped_files += 1
            except Exception as e:
                print(
                    f"  Warning: Skipping file '{relative_path}' due to unexpected error: {e}",
                    file=sys.stderr,
                )
                skipped_files += 1
        else:
            # This block didn't start with a recognizable marker after splitting by END marker
            # It might be leftover data or a corrupted entry
            if block.strip():  # Only warn if there's actual content
                print(
                    f"Warning: Found data block without a valid start marker near character {current_pos}. Content ignored.",
                    file=sys.stderr,
                )
                skipped_files += 1  # Count this as a skipped/problematic entry

        # Update approximate position for error reporting (not perfect but helpful)
        current_pos += len(block) + len(FILE_END_MARKER) + 2  # +2 for the \n

    print("-" * 20)
    if extracted_files > 0:
        print(f"Success! Extracted {extracted_files} files to '{output_dir_path}'.")
    else:
        print("No files were extracted.")
    if skipped_files > 0:
        print(
            f"Skipped {skipped_files} files/entries due to errors, user choice, or malformed data."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Extracts files from a 'cats_output.txt' file (created by cats.py) "
            "and recreates the original directory structure."
        )
    )
    parser.add_argument(
        "input_file", help="The concatenated input file created by cats.py."
    )
    parser.add_argument(
        "target_directory", help="The directory where files will be extracted."
    )
    parser.add_argument(
        "-f",
        "--force",
        action="store_true",
        help="Force overwrite of existing files without asking for confirmation.",
    )

    args = parser.parse_args()

    extract_files(args.input_file, args.target_directory, args.force)
