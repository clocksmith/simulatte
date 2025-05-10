#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import os
import argparse
import base64
from typing import List, Tuple, Dict, Optional, Union, Any

FILE_START_MARKER_TEMPLATE = "--- CATS_START_FILE: {} ---"
FILE_END_MARKER = "--- CATS_END_FILE ---"
DEFAULT_ENCODING = "utf-8"
DEFAULT_OUTPUT_FILENAME = "cats_out.bundle"
BUNDLE_HEADER_PREFIX = "# Cats Bundle"
BUNDLE_FORMAT_PREFIX = "# Format: "


FileObject = Dict[str, Union[str, bytes, bool]]


def is_likely_utf8(file_content_bytes: bytes) -> bool:
    """Checks if file content is likely UTF-8 by attempting to decode."""
    if not file_content_bytes:
        return True  # Empty files are UTF-8 compatible
    try:
        file_content_bytes.decode(DEFAULT_ENCODING)
        return True
    except UnicodeDecodeError:
        return False


def get_final_paths_to_process(
    include_paths_raw: List[str],
    exclude_paths_raw: List[str],
    output_file_abs_path: Optional[str] = None,
) -> List[str]:
    """
    Determines the final list of absolute, canonical file paths to include.
    Handles exclusions and output file skipping. Returns sorted absolute file paths.
    """
    candidate_file_realpaths = set()
    abs_excluded_realpaths_set = {
        os.path.realpath(os.path.abspath(p)) for p in exclude_paths_raw
    }
    abs_excluded_dirs_for_pruning_set = {
        p_realpath
        for p_realpath in abs_excluded_realpaths_set
        if os.path.isdir(p_realpath)
    }
    processed_top_level_input_realpaths = set()

    for incl_path_raw in include_paths_raw:
        abs_incl_path = os.path.abspath(incl_path_raw)
        current_input_realpath = os.path.realpath(abs_incl_path)

        if current_input_realpath in processed_top_level_input_realpaths:
            continue
        processed_top_level_input_realpaths.add(current_input_realpath)

        if output_file_abs_path and current_input_realpath == output_file_abs_path:
            # Silently skip if output file is part of input
            continue
        if current_input_realpath in abs_excluded_realpaths_set:
            continue

        is_inside_excluded_dir = any(
            current_input_realpath.startswith(excluded_dir_rp + os.path.sep)
            for excluded_dir_rp in abs_excluded_dirs_for_pruning_set
        )
        if is_inside_excluded_dir:
            continue

        if not os.path.exists(current_input_realpath):
            print(
                f"  Warning: Input path '{incl_path_raw}' not found. Skipping.",
                file=sys.stderr,
            )
            continue

        if os.path.isfile(current_input_realpath):
            candidate_file_realpaths.add(current_input_realpath)
        elif os.path.isdir(current_input_realpath):
            for dirpath, dirnames, filenames in os.walk(
                current_input_realpath, topdown=True, followlinks=False
            ):
                current_walk_dir_realpath = os.path.realpath(dirpath)
                # Prune dirnames based on exclusion set
                dirnames[:] = [
                    d_name
                    for d_name in dirnames
                    if os.path.realpath(os.path.join(current_walk_dir_realpath, d_name))
                    not in abs_excluded_dirs_for_pruning_set
                ]
                for f_name in filenames:
                    file_realpath_in_walk = os.path.realpath(
                        os.path.join(current_walk_dir_realpath, f_name)
                    )
                    if (
                        (
                            output_file_abs_path
                            and file_realpath_in_walk == output_file_abs_path
                        )
                        or (file_realpath_in_walk in abs_excluded_realpaths_set)
                        or any(
                            file_realpath_in_walk.startswith(ex_dir + os.path.sep)
                            for ex_dir in abs_excluded_dirs_for_pruning_set
                        )
                    ):
                        continue
                    # Ensure it's a file and not a broken symlink, etc.
                    if os.path.isfile(file_realpath_in_walk):
                        candidate_file_realpaths.add(file_realpath_in_walk)
    return sorted(list(candidate_file_realpaths))


def generate_bundle_relative_path(file_realpath: str, common_ancestor_path: str) -> str:
    """Generates a relative path for the bundle marker, using forward slashes."""
    try:
        if common_ancestor_path == file_realpath:  # Input is a single file
            return os.path.basename(file_realpath)

        rel_path = os.path.relpath(file_realpath, common_ancestor_path)
        if (
            rel_path == "." or not rel_path
        ):  # relpath might return '.' if paths are identical
            return os.path.basename(file_realpath)
    except ValueError:  # Can happen if paths are on different drives (Windows)
        rel_path = os.path.basename(file_realpath)

    return rel_path.replace(os.path.sep, "/")


def find_common_ancestor(paths: List[str]) -> str:
    """Finds the longest common ancestor directory for a list of absolute paths."""
    if not paths:
        return os.getcwd()

    real_paths = [os.path.realpath(os.path.abspath(p)) for p in paths]

    if len(real_paths) == 1:
        p_stat = os.stat(real_paths[0])
        return (
            os.path.dirname(real_paths[0])
            if os.path.isfile(real_paths[0])  # Correctly check if it's a file
            else real_paths[0]
        )

    # Use os.path.commonpath which is robust.
    # commonpath needs directories for comparison if files are involved.
    paths_for_commonpath = []
    for p_rp in real_paths:
        if os.path.isdir(p_rp):
            paths_for_commonpath.append(p_rp)
        else:  # isfile or symlink etc.
            paths_for_commonpath.append(os.path.dirname(p_rp))

    if not paths_for_commonpath:  # Should not happen if real_paths was populated
        return os.getcwd()

    common = os.path.commonpath(paths_for_commonpath)
    return common


def prepare_file_objects_from_paths(
    abs_file_paths: List[str], common_ancestor_for_relpath: str
) -> Tuple[List[FileObject], bool]:
    """
    Reads files, determines UTF-8, prepares for bundling.
    Returns list of file objects and bool if any non-UTF-8 found.
    """
    file_objects: List[FileObject] = []
    any_non_utf8_found = False

    for file_abs_path in abs_file_paths:
        try:
            with open(file_abs_path, "rb") as f:
                content_bytes = f.read()

            is_utf8 = is_likely_utf8(content_bytes)
            if not is_utf8:
                any_non_utf8_found = True

            relative_path = generate_bundle_relative_path(
                file_abs_path, common_ancestor_for_relpath
            )

            file_objects.append(
                {
                    "path": file_abs_path,  # Keep original absolute path for reference
                    "relative_path": relative_path,
                    "content_bytes": content_bytes,
                    "is_utf8": is_utf8,
                }
            )
        except Exception as e:
            print(
                f"  Warning: Error reading file '{file_abs_path}': {e}. Skipping.",
                file=sys.stderr,
            )
    return file_objects, any_non_utf8_found


def create_bundle_string_from_objects(
    file_objects: List[FileObject],
    force_base64_bundle: bool,
    any_non_utf8_already_detected: bool,
) -> Tuple[str, str]:
    """
    Creates the bundle string from prepared file objects.
    Returns bundle string and format description.
    """
    bundle_parts = []
    use_base64_for_all = force_base64_bundle or any_non_utf8_already_detected

    format_description = (
        "Base64 (Forced)"
        if force_base64_bundle
        else (
            "Base64 (Auto-Detected due to non-UTF-8 content)"
            if any_non_utf8_already_detected
            else f"Raw {DEFAULT_ENCODING} (All files appear UTF-8 compatible)"
        )
    )

    bundle_parts.append(BUNDLE_HEADER_PREFIX)
    bundle_parts.append(f"{BUNDLE_FORMAT_PREFIX}{format_description}")

    for file_obj in file_objects:
        bundle_parts.append("")
        bundle_parts.append(
            FILE_START_MARKER_TEMPLATE.format(str(file_obj["relative_path"]))
        )
        content_bytes = file_obj["content_bytes"]
        assert isinstance(content_bytes, bytes), "File content must be bytes"

        if use_base64_for_all:
            content_to_write = base64.b64encode(content_bytes).decode(DEFAULT_ENCODING)
        else:
            # This branch assumes content_bytes is UTF-8 decodable based on prior checks
            content_to_write = content_bytes.decode(DEFAULT_ENCODING)
        bundle_parts.append(content_to_write)
        bundle_parts.append(FILE_END_MARKER)
    return "\n".join(bundle_parts) + "\n", format_description


def create_bundle_from_paths(
    include_paths_raw: List[str],
    exclude_paths_raw: List[str],
    force_base64: bool,
    output_file_abs_path: Optional[str] = None,
    base_dir_for_relpath: Optional[str] = None,
) -> Tuple[str, str, int]:
    """
    High-level function to create a bundle string from specified paths.

    Args:
        include_paths_raw: List of file or directory paths to include.
        exclude_paths_raw: List of file or directory paths to exclude.
        force_base64: If True, all files will be Base64 encoded.
        output_file_abs_path: Optional. Absolute path to the bundle output file,
                              used for self-exclusion if it's part of input paths.
        base_dir_for_relpath: Optional. If provided, this directory will be used
                              as the base for generating relative paths in the bundle.
                              Otherwise, a common ancestor of input paths is found.

    Returns:
        A tuple containing:
        - The bundle content as a string.
        - A description of the bundle's format (e.g., "Raw UTF-8", "Base64 (Forced)").
        - The number of files successfully added to the bundle.
    """
    abs_file_paths_to_bundle = get_final_paths_to_process(
        include_paths_raw, exclude_paths_raw, output_file_abs_path
    )
    if not abs_file_paths_to_bundle:
        return "", "No files selected", 0

    if base_dir_for_relpath:
        common_ancestor = os.path.realpath(os.path.abspath(base_dir_for_relpath))
    else:
        # Use only the effectively included top-level paths for common ancestor calculation
        # or fall back to individual file paths if all inputs are files.
        top_level_inputs_for_ancestor = []
        for p_raw in include_paths_raw:
            p_abs = os.path.realpath(os.path.abspath(p_raw))
            # Only consider paths that could lead to included files
            if (
                any(f.startswith(p_abs) for f in abs_file_paths_to_bundle)
                or p_abs in abs_file_paths_to_bundle
            ):
                top_level_inputs_for_ancestor.append(p_abs)
        if not top_level_inputs_for_ancestor:  # e.g. if all inputs were single files
            top_level_inputs_for_ancestor = abs_file_paths_to_bundle

        common_ancestor = find_common_ancestor(top_level_inputs_for_ancestor)

    file_objects, any_non_utf8 = prepare_file_objects_from_paths(
        abs_file_paths_to_bundle, common_ancestor
    )
    if not file_objects:
        return "", "No files successfully processed", 0

    bundle_content, format_desc = create_bundle_string_from_objects(
        file_objects, force_base64, any_non_utf8
    )
    return bundle_content, format_desc, len(file_objects)


def confirm_action_prompt(prompt_message: str) -> bool:
    """Asks user for Y/n confirmation, defaults to Y. For CLI use."""
    while True:
        try:
            choice = input(f"{prompt_message} [Y/n]: ").strip().lower()
            if choice == "y" or choice == "":
                return True
            if choice == "n":
                return False
            print("Invalid input. Please enter 'y' or 'n'.")
        except KeyboardInterrupt:
            print("\nOperation cancelled by user.")
            return False
        except EOFError:  # Handle Ctrl+D
            print("\nOperation cancelled (EOF).")
            return False


def main_cli():
    parser = argparse.ArgumentParser(
        description="cats.py : Bundles project files into a single text artifact for LLMs.",
        epilog="Example: python cats.py ./src ./docs -x ./src/tests -o my_project.bundle",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "paths", nargs="+", metavar="PATH", help="Files/directories to include."
    )
    parser.add_argument(
        "-o",
        "--output",
        default=DEFAULT_OUTPUT_FILENAME,
        metavar="BUNDLE_FILE",
        help=f"Output bundle file (default: {DEFAULT_OUTPUT_FILENAME}).",
    )
    parser.add_argument(
        "-x",
        "--exclude",
        action="append",
        default=[],
        metavar="EXCLUDE_PATH",
        help="Path to exclude (file or directory). Use multiple times.",
    )
    parser.add_argument(
        "--force-b64", action="store_true", help="Force Base64 encoding for all files."
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Automatically confirm and proceed without prompting (if a prompt would occur).",
    )

    if len(sys.argv) == 1:
        parser.print_help(sys.stderr)
        sys.exit(1)
    args = parser.parse_args()

    abs_output_file_realpath = os.path.realpath(os.path.abspath(args.output))

    print("Phase 1: Collecting and filtering files...")
    bundle_content, format_description, files_added_count = create_bundle_from_paths(
        args.paths, args.exclude, args.force_b64, abs_output_file_realpath
    )

    if files_added_count == 0:
        print(f"No files selected for bundling. {format_description}. Exiting.")
        return

    print(f"  Files to be bundled: {files_added_count}")
    if args.force_b64:
        print("  Encoding: All files will be Base64 encoded (user forced).")
    else:
        print(f"  Bundle format determined: {format_description.split('(')[0].strip()}")

    if not args.yes and sys.stdin.isatty():
        # Simple preview of what will be bundled for confirmation
        # This can be made more sophisticated if needed.
        print(f"  Output will be written to: {abs_output_file_realpath}")
        if not confirm_action_prompt("\nProceed with bundling?"):
            print("Bundling cancelled by user.")
            return
    elif not sys.stdin.isatty() and not args.yes:
        print("  Non-interactive mode, proceeding without confirmation prompt.")

    print(f"\nPhase 2: Writing bundle to '{abs_output_file_realpath}'...")
    print(f"  Final Bundle Format: {format_description}")

    try:
        output_parent_dir = os.path.dirname(abs_output_file_realpath)
        if output_parent_dir and not os.path.exists(output_parent_dir):
            os.makedirs(output_parent_dir, exist_ok=True)
        with open(
            abs_output_file_realpath, "w", encoding=DEFAULT_ENCODING, errors="replace"
        ) as f_bundle:
            f_bundle.write(bundle_content)
        print(f"\nBundle created successfully: '{args.output}'")
        print(f"  Files added: {files_added_count}")
    except Exception as e:
        print(f"\nFatal error writing bundle: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main_cli()
