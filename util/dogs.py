import sys
import os
import argparse
import base64
import re
import binascii

# Define markers (must match cats.py)
FILE_START_MARKER_REGEX = re.compile(r"--- CATS_START_FILE: (.*?) ---")
FILE_END_MARKER = "--- CATS_END_FILE ---"
ENCODING = "utf-8"  # Encoding for markers, paths, and non-base64 content
HEADER_REGEX = re.compile(r"^# Base64 Encoded: (True|False)", re.MULTILINE)


def determine_input_format(input_content):
    """
    Reads the header comment to determine if the content is Base64 encoded.
    Returns True if Base64, False if raw text, None if header is missing/invalid.
    """
    header_match = HEADER_REGEX.search(input_content)
    if header_match:
        return header_match.group(1) == "True"
    return None  # Header not found or malformed


def extract_files(input_file_path, output_dir_path, force_overwrite=False):
    """
    Reads the concatenated file, extracts files based on markers,
    detects encoding via header, decodes/encodes as needed,
    and recreates the file structure in the output directory.
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
        with open(input_file_path, "r", encoding=ENCODING, errors="replace") as infile:
            content = infile.read()

    except Exception as e:
        print(
            f"Error: Could not read input file '{input_file_path}': {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    is_input_base64 = determine_input_format(content)

    if is_input_base64 is None:
        print(
            f"Warning: Could not find '# Base64 Encoded: ...' header in '{input_file_path}'.",
            file=sys.stderr,
        )
        # Defaulting strategy: Try to guess based on first few blocks, or assume Base64
        print(
            "Attempting to guess format (may be unreliable)... assuming Base64.",
            file=sys.stderr,
        )
        is_input_base64 = True  # Default assumption if header missing

    print(f"Input format detected as: {'Base64' if is_input_base64 else 'Raw Text'}")

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

    # Process blocks
    current_pos = 0
    # Find first marker to skip potential header lines
    first_marker_match = FILE_START_MARKER_REGEX.search(content)
    if not first_marker_match:
        print(
            "Error: No '--- CATS_START_FILE: ... ---' markers found in the input file.",
            file=sys.stderr,
        )
        sys.exit(1)

    start_processing_index = first_marker_match.start()

    # Split based on start marker, keeping the marker itself
    # Use a positive lookbehind assertion `(?=...)` to split *before* the marker
    potential_blocks = re.split(
        r"(?=\n--- CATS_START_FILE: .*? ---)", content[start_processing_index:]
    )

    for block in potential_blocks:
        block = block.strip()  # Remove leading/trailing whitespace from the split part
        if not block:
            continue

        start_match = FILE_START_MARKER_REGEX.match(
            block
        )  # Use match as it should be at the start now

        if start_match:
            relative_path_raw = start_match.group(1).strip()
            # Content starts after the start marker line
            content_start_index = (
                block.find("\n", start_match.end()) + 1
                if block.find("\n", start_match.end()) != -1
                else start_match.end()
            )

            # Find the end marker for this block
            end_marker_index = block.find(f"\n{FILE_END_MARKER}")
            if end_marker_index == -1:
                print(
                    f"Warning: Missing end marker for file '{relative_path_raw}' near character {current_pos + block.find(relative_path_raw)}. Skipping rest of file.",
                    file=sys.stderr,
                )
                skipped_files += 1  # Count as skipped
                break  # Stop processing further blocks as structure is compromised

            content_raw = block[content_start_index:end_marker_index].strip()

            # Use the cleaned relative path (already normalized in cats.py)
            relative_path = os.path.normpath(relative_path_raw)

            if not relative_path:
                print(
                    f"Warning: Found marker with empty path near character {current_pos}. Skipping.",
                    file=sys.stderr,
                )
                skipped_files += 1
                current_pos += len(block)  # Approx update
                continue

            # Security check
            if ".." in relative_path.split(os.path.sep):
                print(
                    f"Warning: Skipped potentially unsafe path '{relative_path}' containing '..'.",
                    file=sys.stderr,
                )
                skipped_files += 1
                current_pos += len(block)
                continue

            full_output_path = os.path.join(output_dir_path, relative_path)
            output_file_dir = os.path.dirname(full_output_path)

            print(f"Extracting: {relative_path}")

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
                        current_pos += len(block)
                        continue
                    else:
                        print(f"  Overwriting '{relative_path}'...")
                except EOFError:
                    print(
                        "\n  Warning: Could not get confirmation (EOF). Skipping overwrite.",
                        file=sys.stderr,
                    )
                    skipped_files += 1
                    current_pos += len(block)
                    continue

            try:
                # Ensure the specific directory for this file exists
                if output_file_dir and not os.path.exists(output_file_dir):
                    try:
                        os.makedirs(output_file_dir, exist_ok=True)
                    except OSError as mkdir_e:
                        print(
                            f"  Error: Could not create directory '{output_file_dir}': {mkdir_e}. Skipping file '{relative_path}'.",
                            file=sys.stderr,
                        )
                        skipped_files += 1
                        current_pos += len(block)
                        continue

                file_content_bytes = None
                if is_input_base64:
                    try:
                        # Decode base64 content string -> bytes
                        file_content_bytes = base64.b64decode(
                            content_raw.encode(ENCODING)
                        )
                        print(f"  Decoded Base64 content for '{relative_path}'.")
                    except binascii.Error as e:
                        print(
                            f"  Warning: Skipping file '{relative_path}' due to Base64 decode error: {e}",
                            file=sys.stderr,
                        )
                        skipped_files += 1
                        current_pos += len(block)
                        continue  # Skip to next block
                else:
                    # Input was raw text, encode it back to bytes using defined ENCODING
                    try:
                        file_content_bytes = content_raw.encode(ENCODING)
                        print(
                            f"  Encoding raw text content for '{relative_path}' using {ENCODING}."
                        )
                    except Exception as encode_e:
                        print(
                            f"  Warning: Skipping file '{relative_path}' due to text encode error: {encode_e}",
                            file=sys.stderr,
                        )
                        skipped_files += 1
                        current_pos += len(block)
                        continue  # Skip to next block

                # Write the actual file content as binary ('wb' mode)
                with open(full_output_path, "wb") as outfile:
                    outfile.write(file_content_bytes)

                print(f"  Successfully extracted to: {full_output_path}")
                extracted_files += 1

            except IOError as e:
                print(
                    f"  Warning: Skipping file '{relative_path}' due to write error: {e}",
                    file=sys.stderr,
                )
                skipped_files += 1
            except Exception as e:
                print(
                    f"  Warning: Skipping file '{relative_path}' due to unexpected error during write: {e}",
                    file=sys.stderr,
                )
                skipped_files += 1
        else:
            # This should not happen with the new splitting logic unless the file is malformed
            print(
                f"Warning: Found data block without a valid start marker near character {current_pos}. Content ignored.",
                file=sys.stderr,
            )
            skipped_files += 1

        current_pos += len(block)  # Approx update position

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
            "Extracts files from a concatenated file (created by cats.py), "
            "detecting Base64/raw format via header, and recreates the "
            "original directory structure."
        ),
        epilog=(
            "Example: python dogs.py project.cats ./restored_project\n"
            "Example (force overwrite): python dogs.py project.cats ./output -f"
        ),
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
