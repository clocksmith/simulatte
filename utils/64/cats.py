#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cats.py: Concatenate Files Tool (v2)

Concatenates files from specified input paths into a single output file.
Features auto-detection for output format (UTF-8 or Base64) based on input
file decodability, with options to override. Handles directories recursively.
"""

import sys
import os
import argparse
import base64
import chardet  # Using chardet for more robust detection attempt

# --- Configuration ---
FILE_START_MARKER_TEMPLATE = "--- CATS_START_FILE: {} ---"
FILE_END_MARKER = "--- CATS_END_FILE ---"
DEFAULT_ENCODING = "utf-8"  # Default for markers and text operations
DEFAULT_OUTPUT_FILENAME = "cats_out.bundle"
# --- End Configuration ---


def detect_encoding(file_path):
    """Attempts to detect the encoding of a file."""
    try:
        with open(file_path, "rb") as f:
            raw_data = f.read(4096)  # Read a chunk for detection
            if not raw_data:
                return DEFAULT_ENCODING  # Empty file, assume default
            result = chardet.detect(raw_data)
            encoding = result["encoding"]
            confidence = result["confidence"]
            # print(f"Detected {encoding} with {confidence*100:.1f}% confidence for {os.path.basename(file_path)}")
            # If chardet is very unsure, or detects something unusable, fallback
            if confidence < 0.7 or not encoding or "ascii" in encoding.lower():
                # Try UTF-8 as a common default if ASCII/low confidence
                try:
                    with open(file_path, "r", encoding=DEFAULT_ENCODING) as f_test:
                        f_test.read(1024)
                    # print(f"Confirmed {DEFAULT_ENCODING} fallback for {os.path.basename(file_path)}")
                    return DEFAULT_ENCODING
                except UnicodeDecodeError:
                    # print(f"Fallback {DEFAULT_ENCODING} failed for {os.path.basename(file_path)}")
                    return None  # Indicate cannot decode as preferred text
                except Exception:
                    return None  # Other read errors
            # Use chardet's detected encoding if confidence is reasonable
            # Normalize common names
            if "utf-8" in encoding.lower():
                return DEFAULT_ENCODING
            if "windows-1252" in encoding.lower():
                return "latin-1"  # Example normalization
            # Add more normalizations if needed
            return encoding
    except Exception:
        return None  # Indicate failure to detect/read


def check_inputs_decodable(input_paths, output_file_path):
    """
    Checks if all input files can be decoded using DEFAULT_ENCODING.
    Returns True if all are decodable, False otherwise.
    """
    print("Phase 1: Checking input file decodability...")
    all_decodable = True
    files_to_check = []
    absolute_output_path = (
        os.path.abspath(output_file_path) if output_file_path else None
    )

    for input_path in input_paths:
        absolute_input_path = os.path.abspath(input_path)
        if absolute_output_path and absolute_input_path == absolute_output_path:
            continue  # Skip output file
        if not os.path.exists(input_path):
            continue  # Skip non-existent

        if os.path.isfile(input_path):
            files_to_check.append(absolute_input_path)
        elif os.path.isdir(input_path):
            for dirpath, _, filenames in os.walk(input_path):
                # Avoid recursing into output dir if it's inside input dir
                if absolute_output_path and os.path.abspath(dirpath).startswith(
                    os.path.dirname(absolute_output_path)
                ):
                    if os.path.basename(
                        absolute_output_path
                    ) in filenames and os.path.abspath(dirpath) == os.path.dirname(
                        absolute_output_path
                    ):
                        print(f"  (Will skip output file found in {dirpath})")
                    # Potentially skip whole dir if it IS the output dir parent? Be careful.
                    # For now, just skip the output file itself later.
                    pass

                for filename in filenames:
                    file_path = os.path.join(dirpath, filename)
                    abs_file_path = os.path.abspath(file_path)
                    if absolute_output_path and abs_file_path == absolute_output_path:
                        continue  # Skip output file
                    files_to_check.append(abs_file_path)

    if not files_to_check:
        print("  No valid input files found to check.")
        return False  # Or True? If no files, maybe default to text? Let's say False.

    print(
        f"  Checking {len(files_to_check)} file(s) for {DEFAULT_ENCODING} compatibility..."
    )
    for file_path in files_to_check:
        detected_encoding = detect_encoding(file_path)
        if (
            detected_encoding is None
            or detected_encoding.lower() != DEFAULT_ENCODING.lower()
        ):
            # Try reading with default encoding one last time
            try:
                with open(file_path, "r", encoding=DEFAULT_ENCODING) as f_test:
                    f_test.read(1024)  # Try reading a small chunk
            except (UnicodeDecodeError, IOError, Exception):
                print(
                    f"  -> Found non-{DEFAULT_ENCODING} or unreadable file: {os.path.basename(file_path)} (Detected: {detected_encoding})"
                )
                all_decodable = False
                break  # One failure means we use Base64

    if all_decodable:
        print(
            f"  Result: All {len(files_to_check)} input files appear compatible with {DEFAULT_ENCODING}."
        )
    else:
        print(
            f"  Result: Found files not compatible with {DEFAULT_ENCODING}. Will use Base64 encoding."
        )

    return all_decodable


def process_file(file_path, output_file, base_dir, use_base64):
    """
    Reads a single file, encodes/decodes it, and writes to the output file.
    Returns True on success, False on skip/error.
    """
    relative_path = os.path.relpath(file_path, base_dir).replace(os.path.sep, "/")
    status = "[Skipped]"
    try:
        print(f"  Processing: {relative_path}...", end="")
        content_to_write = None
        with open(file_path, "rb") as infile:
            binary_content = infile.read()

        if use_base64:
            encoded_bytes = base64.b64encode(binary_content)
            content_to_write = encoded_bytes.decode(
                DEFAULT_ENCODING
            )  # Store B64 as text
            status = "[Base64 Encoded]"
        else:
            # Attempt to decode as the default text encoding (already pre-checked)
            try:
                content_to_write = binary_content.decode(DEFAULT_ENCODING)
                status = f"[Raw Text OK: {DEFAULT_ENCODING}]"
            except UnicodeDecodeError:
                # This shouldn't happen if pre-check was done, but handle defensively
                print(
                    f" [Error: Failed {DEFAULT_ENCODING} decode despite pre-check! Skipping.]",
                    file=sys.stderr,
                )
                return False  # Skip this file

        # Write marker and content
        output_file.write(f"\n{FILE_START_MARKER_TEMPLATE.format(relative_path)}\n")
        output_file.write(content_to_write)
        output_file.write(f"\n{FILE_END_MARKER}\n")
        print(f" {status}")
        return True

    except IOError as e:
        print(f" [Read Error: {e}]", file=sys.stderr)
        return False
    except MemoryError:
        print(f" [Memory Error: File too large?]", file=sys.stderr)
        return False
    except Exception as e:
        print(f" [Unexpected Error: {e}]", file=sys.stderr)
        return False


def run_concatenation(input_paths, output_file_path, force_encoding):
    """
    Main function to perform the concatenation process.
    """
    processed_files = 0
    skipped_files = 0
    error_files = 0
    absolute_output_path = os.path.abspath(output_file_path)

    # --- Determine Encoding Mode ---
    use_base64 = False
    output_format_str = ""
    if force_encoding == "b64":
        use_base64 = True
        output_format_str = "Base64 (Forced)"
        print("\nEncoding Mode: Forced Base64")
    elif force_encoding == "utf8":
        use_base64 = False
        output_format_str = f"Raw {DEFAULT_ENCODING} (Forced)"
        print(
            f"\nEncoding Mode: Forced Raw {DEFAULT_ENCODING} (Warning: May fail on binary files)"
        )
    else:  # auto (default)
        print("\nEncoding Mode: Auto-Detect")
        can_use_raw = check_inputs_decodable(input_paths, output_file_path)
        if can_use_raw:
            use_base64 = False
            output_format_str = f"Raw {DEFAULT_ENCODING} (Auto-Detected)"
            print(f"--> Auto-selected: Raw {DEFAULT_ENCODING}")
        else:
            use_base64 = True
            output_format_str = "Base64 (Auto-Detected)"
            print("--> Auto-selected: Base64")
    # --- End Encoding Mode Determination ---

    print(f"\nPhase 2: Writing concatenated output to: '{output_file_path}'")
    try:
        output_dir = os.path.dirname(absolute_output_path)
        if output_dir and not os.path.exists(output_dir):
            print(f"Creating output directory: '{output_dir}'")
            os.makedirs(output_dir)

        # Open output in text mode using default encoding for markers/base64 strings
        with open(
            output_file_path, "w", encoding=DEFAULT_ENCODING, errors="replace"
        ) as outfile:
            outfile.write(f"# Concatenated output generated by cats.py\n")
            outfile.write(f"# Format: {output_format_str}\n")  # Precise header

            for input_path in input_paths:
                absolute_input_path = os.path.abspath(input_path)
                print(f"\nScanning input: '{input_path}'")

                if absolute_input_path == absolute_output_path:
                    print(f"  Skipping: Input path is the output file.")
                    skipped_files += 1
                    continue
                if not os.path.exists(input_path):
                    print(
                        f"  Warning: Input path '{input_path}' not found. Skipping.",
                        file=sys.stderr,
                    )
                    skipped_files += 1
                    continue

                if os.path.isfile(input_path):
                    base_dir = os.path.dirname(absolute_input_path) or "."
                    if process_file(input_path, outfile, base_dir, use_base64):
                        processed_files += 1
                    else:
                        error_files += 1
                elif os.path.isdir(input_path):
                    base_dir = absolute_input_path
                    # Use sorted list for predictable order
                    items_to_process = []
                    for dirpath, dirnames, filenames in os.walk(
                        input_path, topdown=True
                    ):
                        # Filter out output directory early if possible
                        dirs_to_remove = []
                        for i, dirname in enumerate(dirnames):
                            abs_subdir_path = os.path.abspath(
                                os.path.join(dirpath, dirname)
                            )
                            # Check if the subdir itself is the output dir parent/equal
                            if (
                                abs_subdir_path == os.path.dirname(absolute_output_path)
                                or abs_subdir_path == absolute_output_path
                            ):
                                # More precise check: is the output file *directly* in this subdir?
                                potential_output_in_subdir = os.path.join(
                                    abs_subdir_path,
                                    os.path.basename(absolute_output_path),
                                )
                                if os.path.exists(
                                    potential_output_in_subdir
                                ) and os.path.samefile(
                                    potential_output_in_subdir, absolute_output_path
                                ):
                                    print(
                                        f"  Skipping recursion into dir containing output: '{dirname}'"
                                    )
                                    dirs_to_remove.append(dirname)

                        for d in dirs_to_remove:
                            dirnames.remove(d)  # Prevent walking into it

                        # Collect files in this directory
                        for filename in sorted(filenames):
                            file_path = os.path.join(dirpath, filename)
                            items_to_process.append(file_path)

                    # Process collected files
                    for file_path in items_to_process:
                        absolute_file_path = os.path.abspath(file_path)
                        if absolute_file_path == absolute_output_path:
                            print(f"  Skipping output file: {file_path}")
                            skipped_files += 1
                            continue
                        if process_file(file_path, outfile, base_dir, use_base64):
                            processed_files += 1
                        else:
                            error_files += 1
                else:
                    print(
                        f"  Warning: Input path '{input_path}' not file/dir. Skipping.",
                        file=sys.stderr,
                    )
                    skipped_files += 1

    except IOError as e:
        print(
            f"\nFatal Error: Cannot open/write output file '{output_file_path}': {e}",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(f"\nFatal Error: Unexpected concatenation error: {e}", file=sys.stderr)
        # Consider printing traceback for unexpected errors
        # import traceback
        # traceback.print_exc()
        sys.exit(1)

    print("\n" + "=" * 30)
    print("Concatenation Summary:")
    print(f"  Output file: '{output_file_path}'")
    print(f"  Format used: {output_format_str}")
    print(f"  Files successfully processed: {processed_files}")
    if skipped_files > 0:
        print(f"  Paths/Files skipped: {skipped_files}")
    if error_files > 0:
        print(f"  Files skipped due to errors: {error_files}")
    print("=" * 30)


def main():
    """Parses arguments and runs the concatenation."""
    parser = argparse.ArgumentParser(
        description="Concatenates files/directories with format auto-detection (UTF-8/Base64).",
        epilog=(
            "Examples:\n"
            "  python cats.py ./src ./docs -o project.bundle  (Auto-detects format)\n"
            "  python cats.py config.json --force-encoding utf8 -o config.txt\n"
            "  python cats.py image.png --force-encoding b64 -o image.bundle\n"
            "  python cats.py . -o full_project.bundle (Concatenates current dir)"
        ),
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "input_paths",
        nargs="+",
        help="One or more source files or directories.",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=DEFAULT_OUTPUT_FILENAME,
        help=f"Output file path (default: {DEFAULT_OUTPUT_FILENAME}).",
    )
    parser.add_argument(
        "--force-encoding",
        choices=["auto", "b64", "utf8"],
        default="auto",
        help=(
            "Force output encoding format:\n"
            "  auto: Detect if all inputs are UTF-8, else use Base64 (default).\n"
            "  b64: Force Base64 encoding for all files.\n"
            f"  utf8: Force raw text output (using {DEFAULT_ENCODING}). Skips non-decodable files."
        ),
    )

    if len(sys.argv) == 1:
        parser.print_help(sys.stderr)
        sys.exit(1)

    args = parser.parse_args()

    # Add check for chardet library
    try:
        import chardet
    except ImportError:
        print("Error: 'chardet' library not found. Please install it:", file=sys.stderr)
        print("  pip install chardet", file=sys.stderr)
        sys.exit(1)

    run_concatenation(args.input_paths, args.output, args.force_encoding)


if __name__ == "__main__":
    main()
