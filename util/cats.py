import sys
import os
import argparse
import base64

# Define markers (must match dogs.py)
FILE_START_MARKER_TEMPLATE = "--- CATS_START_FILE: {} ---"
FILE_END_MARKER = "--- CATS_END_FILE ---"
ENCODING = "utf-8"  # Encoding for markers, paths, and non-base64 content


def process_file(file_path, output_file, base_dir, use_base64=True):
    """
    Reads a single file, optionally encodes it, and writes it to the
    output file with markers. Returns True on success, False on skip/error.
    """
    relative_path = os.path.relpath(file_path, base_dir)
    relative_path = relative_path.replace(os.path.sep, "/")  # Normalize

    try:
        print(f"Processing: {relative_path}")
        content_to_write = None
        binary_content = None

        # Read the file content in binary mode first
        with open(file_path, "rb") as infile:
            binary_content = infile.read()

        if use_base64:
            # Encode binary content to Base64, then decode Base64 bytes to string
            print(f"  Encoding '{relative_path}' using Base64...")
            encoded_bytes = base64.b64encode(binary_content)
            content_to_write = encoded_bytes.decode(ENCODING)
        else:
            # Try to decode the binary content as raw text using ENCODING *before* writing marker
            print(
                f"  Attempting to include '{relative_path}' as raw text ({ENCODING})..."
            )
            try:
                content_to_write = binary_content.decode(ENCODING)
                print(f"  Successfully decoded '{relative_path}' as raw text.")
            except UnicodeDecodeError:
                print(
                    f"  Warning: Skipping file '{relative_path}'. "
                    f"Cannot decode content using '{ENCODING}'. "
                    f"Use Base64 (default) for binary files.",
                    file=sys.stderr,
                )
                return False  # Skip before writing anything for this file

        # If we reach here, content is ready (either base64 string or decoded text)
        output_file.write(f"\n{FILE_START_MARKER_TEMPLATE.format(relative_path)}\n")
        output_file.write(content_to_write)
        output_file.write(f"\n{FILE_END_MARKER}\n")
        return True

    except IOError as e:
        print(f"  Error: Could not read file '{file_path}': {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(
            f"  Error: Unexpected error processing file '{file_path}': {e}",
            file=sys.stderr,
        )
        return False


def concatenate_files(input_paths, output_file_path, use_base64=True):
    """
    Walks through input paths (files or directories) and concatenates
    them into the output file.
    """
    processed_files = 0
    skipped_files = 0
    absolute_output_path = os.path.abspath(output_file_path)

    try:
        with open(output_file_path, "w", encoding=ENCODING) as outfile:
            print(f"Writing concatenated output to: '{output_file_path}'")
            print(f"Using Base64 encoding: {use_base64}")
            outfile.write(f"# Concatenated output generated by cats.py\n")
            outfile.write(f"# Base64 Encoded: {use_base64}\n")

            for input_path in input_paths:
                absolute_input_path = os.path.abspath(input_path)
                if absolute_input_path == absolute_output_path:
                    print(f"Skipping output file itself: {input_path}")
                    skipped_files += 1
                    continue

                if os.path.isfile(input_path):
                    base_dir = os.path.dirname(input_path)
                    if process_file(input_path, outfile, base_dir, use_base64):
                        processed_files += 1
                    else:
                        skipped_files += 1
                elif os.path.isdir(input_path):
                    base_dir = input_path
                    for dirpath, dirnames, filenames in os.walk(input_path):
                        # Prevent recursing into the output directory if it's inside the input
                        if absolute_output_path.startswith(
                            os.path.abspath(dirpath) + os.sep
                        ):
                            print(
                                f"Skipping recursion into output directory parent: {dirpath}"
                            )
                            dirnames[:] = []  # Don't recurse further down this branch
                            continue

                        for filename in filenames:
                            file_path = os.path.join(dirpath, filename)
                            if os.path.abspath(file_path) == absolute_output_path:
                                print(f"Skipping output file itself: {file_path}")
                                skipped_files += 1
                                continue
                            if process_file(file_path, outfile, base_dir, use_base64):
                                processed_files += 1
                            else:
                                skipped_files += 1
                else:
                    print(
                        f"Warning: Input path '{input_path}' is not a valid file or directory. Skipping.",
                        file=sys.stderr,
                    )
                    skipped_files += 1

    except IOError as e:
        print(
            f"Error: Could not open or write to output file '{output_file_path}': {e}",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(
            f"An unexpected error occurred: {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    print("-" * 20)
    print(f"Finished concatenation.")
    print(f"Successfully processed: {processed_files} files.")
    if skipped_files > 0:
        print(f"Skipped: {skipped_files} files due to errors or incompatibility.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Recursively concatenates files/directories into a single output file. "
            "Handles both text (UTF-8) and binary files (using Base64 by default)."
        ),
        epilog=(
            "Example: python cats.py ./src ./docs -o project.cats\n"
            "Example (raw text): python cats.py ./config --no-base64 -o config.txt"
        ),
    )
    parser.add_argument(
        "input_paths",
        nargs="+",
        help="One or more source files or directories to process.",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="cats_output.txt",
        help="The path for the concatenated output file (default: cats_output.txt).",
    )
    parser.add_argument(
        "--no-base64",
        action="store_true",
        help=(
            "Store content as raw text (UTF-8 decoded) instead of Base64. "
            "Files that cannot be decoded as UTF-8 will be skipped with a warning."
        ),
    )

    args = parser.parse_args()
    should_use_base64 = not args.no_base64

    concatenate_files(args.input_paths, args.output, should_use_base64)
