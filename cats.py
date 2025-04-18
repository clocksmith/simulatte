import sys
import os
import argparse
import base64  # Using base64 to handle binary data safely within a text-like format

# Define unique markers
# Using base64 for the content makes the markers safer as raw binary sequences
# matching the markers are less likely, but we still use clear text markers for structure.
FILE_START_MARKER_TEMPLATE = "--- CATS_START_FILE: {} ---"
FILE_END_MARKER = "--- CATS_END_FILE ---"
ENCODING = "utf-8"  # Encoding for markers and paths


def concatenate_files_recursively(directory_path, output_file_path):
    """
    Recursively walks through a directory, reads files, encodes them in base64,
    and writes them to an output file with start/end markers containing relative paths.
    """
    absolute_output_path = os.path.abspath(output_file_path)
    processed_files = 0
    skipped_files = 0

    print(
        f"Starting concatenation from '{directory_path}' into '{output_file_path}'..."
    )

    try:
        # Open output in text mode, as base64 is text-safe
        with open(output_file_path, "w", encoding=ENCODING) as outfile:
            for root, _, files in os.walk(directory_path):
                for filename in files:
                    file_path = os.path.join(root, filename)
                    absolute_file_path = os.path.abspath(file_path)

                    # Prevent reading the output file itself
                    if absolute_file_path == absolute_output_path:
                        print(f"Skipping output file itself: {file_path}")
                        skipped_files += 1
                        continue

                    try:
                        # Get relative path for storing in the marker
                        relative_path = os.path.relpath(file_path, directory_path)
                        print(f"Processing: {relative_path}")

                        # Write start marker with relative path
                        start_marker = FILE_START_MARKER_TEMPLATE.format(relative_path)
                        outfile.write(f"\n{start_marker}\n")

                        # Read file content as binary
                        with open(file_path, "rb") as infile:
                            binary_content = infile.read()

                        # Encode binary content to base64 string
                        base64_content = base64.b64encode(binary_content).decode(
                            ENCODING
                        )
                        outfile.write(base64_content)

                        # Write end marker
                        outfile.write(f"\n{FILE_END_MARKER}\n")
                        processed_files += 1

                    except Exception as e:
                        print(
                            f"Warning: Skipping file '{file_path}' due to error: {e}",
                            file=sys.stderr,
                        )
                        skipped_files += 1

        print("-" * 20)
        print(f"Success! Concatenated {processed_files} files.")
        if skipped_files > 0:
            print(
                f"Skipped {skipped_files} files (including potentially the output file or due to errors)."
            )
        print(f"Output written to: {output_file_path}")

    except IOError as e:
        print(
            f"\nError: Could not write to output file '{output_file_path}': {e}",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(
            f"\nAn unexpected error occurred during concatenation: {e}", file=sys.stderr
        )
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Recursively concatenates files from a directory into a single output file. "
            "File content is base64 encoded to handle binary data safely."
        )
    )
    parser.add_argument(
        "directory", help="The source directory to scan recursively for files."
    )
    parser.add_argument(
        "-o",
        "--output",
        default="cats_output.txt",
        help="The path for the concatenated output file (default: cats_output.txt).",
    )

    args = parser.parse_args()
    target_directory = args.directory
    output_file = args.output

    if not os.path.isdir(target_directory):
        print(
            f"Error: Source '{target_directory}' is not a valid directory.",
            file=sys.stderr,
        )
        sys.exit(1)

    concatenate_files_recursively(target_directory, output_file)
