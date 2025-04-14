import os
import sys
import json
import re
import shutil

TARGET_DIR = "public/0"
NEW_BOOT_SCRIPT_FILENAME = "reploid-boot-script.js"

file_rename_map = {
    "core_config_x0.json": "reploid-core-config.json",
    "core_utils_script.js": "reploid-core-utils.js",
    "core_storage_script.js": "reploid-core-storage.js",
    "core_tool_runner.js": "reploid-core-toolrunner.js",
    "core_reploid_statemanager.js": "reploid-core-statemanager.js",
    "core_reploid_apiclient.js": "reploid-core-apiclient.js",
    "core_reploid_ui.js": "reploid-core-ui.js",
    "core_reploid_cyclelogic.js": "reploid-core-cyclelogic.js",
    "core_reploid_script.js": "reploid-core-logic.js",
    "core_reploid_body.html": "reploid-core-body.html",
    "core_reploid_style.css": "reploid-core-style.css",
    "core_prompt_x0.txt": "reploid-core-sys-prompt.txt",
    "core_prompt_critiquer.txt": "reploid-core-critiquer-prompt.txt",
    "core_prompt_summarizer.txt": "reploid-core-summarizer-prompt.txt",
    "core_static_tools.json": "reploid-core-static-tools.json",
    "core_diagram.json": "reploid-core-diagram.json",
    "core_cycle.txt": "reploid-core-cycle-steps.txt",
    "core_diagram_factory.js": "reploid-core-diagram-factory.js",
}

string_replace_map = {
    "'reploid.core.config.json'": "'reploid-core-config.json'",
    '"reploid.core.config.json"': '"reploid-core-config.json"',
    "'core_config_x0.json'": "'reploid-core-config.json'",
    '"core_config_x0.json"': '"reploid-core-config.json"',
    "'core_utils_script.js'": "'reploid-core-utils.js'",
    '"core_utils_script.js"': '"reploid-core-utils.js"',
    "'core_storage_script.js'": "'reploid-core-storage.js'",
    '"core_storage_script.js"': '"reploid-core-storage.js"',
    "'core_tool_runner.js'": "'reploid-core-toolrunner.js'",
    '"core_tool_runner.js"': '"reploid-core-toolrunner.js"',
    "'core_reploid_statemanager.js'": "'reploid-core-statemanager.js'",
    '"core_reploid_statemanager.js"': '"reploid-core-statemanager.js"',
    "'core_reploid_apiclient.js'": "'reploid-core-apiclient.js'",
    '"core_reploid_apiclient.js"': '"reploid-core-apiclient.js"',
    "'core_reploid_ui.js'": "'reploid-core-ui.js'",
    '"core_reploid_ui.js"': '"reploid-core-ui.js"',
    "'core_reploid_cyclelogic.js'": "'reploid-core-cyclelogic.js'",
    '"core_reploid_cyclelogic.js"': '"reploid-core-cyclelogic.js"',
    "'core_reploid_script.js'": "'reploid-core-logic.js'",
    '"core_reploid_script.js"': '"reploid-core-logic.js"',
    "UtilsModule": "UtilsModule",
    "StorageModule": "StorageModule",
    "ToolRunnerModule": "ToolRunnerModule",
    "StateManagerModule": "StateManagerModule",
    "ApiClientModule": "ApiClientModule",
    "UIModule": "UIModule",
    "CycleLogicModule": "CycleLogicModule",
    "REPLOID_CORE_Orchestrator": "REPLOID_CORE_Orchestrator",
}

files_to_search_after_rename = [
    "index.html",
    NEW_BOOT_SCRIPT_FILENAME,
    "reploid-core-logic.js",
    "reploid-core-config.json",
    "reploid-core-utils.js",
    "reploid-core-storage.js",
    "reploid-core-toolrunner.js",
    "reploid-core-statemanager.js",
    "reploid-core-apiclient.js",
    "reploid-core-ui.js",
    "reploid-core-cyclelogic.js",
]


def rename_files(base_dir, rename_map):
    print("--- Starting File Renaming ---")
    renamed_count = 0
    skipped_count = 0
    error_count = 0
    renamed_paths = {}
    for old_name, new_name in rename_map.items():
        old_path = os.path.join(base_dir, old_name)
        new_path = os.path.join(base_dir, new_name)
        renamed_paths[old_name] = new_path
        if old_name == new_name:
            skipped_count += 1
            continue
        if os.path.exists(old_path):
            try:
                shutil.move(old_path, new_path)
                print(f"Renamed/Moved: '{old_name}' -> '{new_name}'")
                renamed_count += 1
            except Exception as e:
                print(f"ERROR renaming/moving '{old_name}' to '{new_name}': {e}")
                error_count += 1
                renamed_paths[old_name] = old_path
        else:
            if not os.path.exists(new_path):
                print(f"Warning: File not found to rename: '{old_name}'")
                renamed_paths[old_name] = None
                skipped_count += 1
            else:
                print(
                    f"Skipping rename (new file already exists?): '{old_name}' -> '{new_name}'"
                )
                skipped_count += 1
    print(
        f"--- Renaming Complete: {renamed_count} renamed, {skipped_count} skipped, {error_count} errors ---"
    )
    return error_count == 0, renamed_paths


def extract_and_replace_boot_script(
    base_dir, index_file="index.html", new_script_name=NEW_BOOT_SCRIPT_FILENAME
):
    print(f"--- Processing {index_file} for Boot Script Extraction/Replacement ---")
    index_path = os.path.join(base_dir, index_file)
    new_script_path = os.path.join(base_dir, new_script_name)
    extracted_content = None
    index_modified = False
    script_created = False

    if not os.path.exists(index_path):
        print(f"ERROR: {index_file} not found at {index_path}")
        return False

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            content = f.read()
        original_content = content

        script_match = re.search(
            r'<script id="boot-script"[^>]*>([\s\S]*?)</script>', content, re.IGNORECASE
        )

        if script_match:
            extracted_content = script_match.group(1).strip()
            script_block_to_replace = script_match.group(0)
            replacement_tag = f'<script src="{new_script_name}" async defer></script>'

            if script_block_to_replace in content:
                content = content.replace(script_block_to_replace, replacement_tag)

                if content != original_content:
                    with open(index_path, "w", encoding="utf-8") as f:
                        f.write(content)
                    print(
                        f"  Replaced inline boot-script with external link in {index_file}"
                    )
                    index_modified = True

                    try:
                        with open(new_script_path, "w", encoding="utf-8") as f:
                            f.write(extracted_content)
                        print(f"  Created {new_script_name} with extracted content.")
                        script_created = True
                    except Exception as e:
                        print(f"ERROR writing {new_script_name}: {e}")
                        extracted_content = None
                else:
                    print(
                        f"  Warning: Content unchanged after replacement attempt in {index_file}. External script tag might already exist?"
                    )
            else:
                print(
                    f"  Warning: Could not find exact script block to replace in {index_file}"
                )
        else:
            print(
                f"  Warning: Could not find inline script block with id='boot-script' in {index_file}"
            )

    except Exception as e:
        print(f"ERROR processing {index_file}: {e}")
        extracted_content = None

    success = index_modified and script_created
    print(f"--- Boot Script Processing Complete: Success={success} ---")
    return success


def replace_strings_in_files(
    base_dir, search_files, replace_map, file_rename_mapping, config_file_new_name
):
    print(f"--- Starting String Replacements in Relevant Files ---")
    modified_files_count = 0
    error_count = 0
    config_file_path = os.path.join(base_dir, config_file_new_name)

    print(f"Processing config file for GENESIS_ARTIFACT_DEFS: {config_file_path}")
    if os.path.exists(config_file_path):
        try:
            with open(config_file_path, "r", encoding="utf-8") as f:
                content = f.read()
            original_content = content
            made_change_in_config = False
            for old_name, new_name in file_rename_mapping.items():
                if old_name == new_name or new_name is None:
                    continue
                pattern_to_find = f'"filename": "{old_name}"'
                pattern_to_replace = f'"filename": "{new_name}"'
                if pattern_to_find in content:
                    print(
                        f"  Updating filename in config: {pattern_to_find} -> {pattern_to_replace}"
                    )
                    content = content.replace(pattern_to_find, pattern_to_replace)
                    made_change_in_config = True

            if made_change_in_config:
                with open(config_file_path, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"  Modified GENESIS_ARTIFACT_DEFS in: {config_file_path}")
                modified_files_count += 1
            else:
                print(
                    f"  No GENESIS_ARTIFACT_DEFS filename changes needed for: {config_file_path}"
                )
        except Exception as e:
            print(f"ERROR updating GENESIS_ARTIFACT_DEFS in '{config_file_path}': {e}")
            error_count += 1
    else:
        print(f"Warning: Config file not found for GENESIS update: {config_file_path}")
        error_count += 1

    for filename in search_files:
        file_path = os.path.join(base_dir, filename)
        print(f"Processing file for string replacements: {file_path}")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                original_content = content
                made_change = False
                for find_str, replace_str in replace_map.items():
                    if find_str in content:
                        print(
                            f"  Replacing in {filename}: '{find_str}' -> '{replace_str}'"
                        )
                        content = content.replace(find_str, replace_str)
                        made_change = True

                if made_change:
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(content)
                    print(f"  Modified strings in: {filename}")
                    if filename != config_file_new_name:
                        modified_files_count += 1
                else:
                    print(f"  No string changes needed for: {filename}")

            except Exception as e:
                print(f"ERROR processing file '{filename}': {e}")
                error_count += 1
        else:
            if filename != NEW_BOOT_SCRIPT_FILENAME:
                print(f"Warning: File not found to search within: '{filename}'")

    print(
        f"--- String Replacement Complete: {modified_files_count} files modified, {error_count} errors ---"
    )
    return error_count == 0


if __name__ == "__main__":
    if not os.path.isdir(TARGET_DIR):
        print(f"ERROR: Target directory '{TARGET_DIR}' not found.")
        print("Please run this script from the parent directory of 'public/0/'.")
        sys.exit(1)

    print("*" * 60)
    print("WARNING: This script performs several refactoring steps:")
    print(
        f"1. Extracts inline boot script from index.html to {NEW_BOOT_SCRIPT_FILENAME}"
    )
    print("2. Modifies index.html to link to the new external script.")
    print("3. Renames core files from snake_case/original names to kebab-case.")
    print(
        "4. Updates filename references within the config file (GENESIS_ARTIFACT_DEFS)."
    )
    print("5. Performs general string replacements in specified files.")
    print(f"Ensure you have BACKED UP the '{TARGET_DIR}' directory!")
    print("*" * 60)
    confirm = input("Type 'yes' to continue: ")

    if confirm.lower() != "yes":
        print("Aborted.")
        sys.exit(0)

    boot_extract_ok = extract_and_replace_boot_script(TARGET_DIR)

    if not boot_extract_ok:
        print(
            "\nERROR: Failed to extract/replace boot script. Aborting further changes."
        )
        sys.exit(1)

    rename_ok, actual_renamed_paths_map = rename_files(TARGET_DIR, file_rename_map)

    if rename_ok:
        new_config_filename = os.path.basename(
            actual_renamed_paths_map.get(
                "core_config_x0.json",
                os.path.join(TARGET_DIR, "reploid-core-config.json"),
            )
        )
        replace_ok = replace_strings_in_files(
            TARGET_DIR,
            files_to_search_after_rename,
            string_replace_map,
            file_rename_map,
            new_config_filename,
        )
        if replace_ok:
            print("\nRefactoring script finished successfully.")
            print(
                f"IMPORTANT: The content of '{NEW_BOOT_SCRIPT_FILENAME}' is the OLD script logic."
            )
            print(
                "Proceed with generating the NEW refactored content for all JS modules."
            )
        else:
            print(
                "\nRefactoring script finished with errors during string replacement."
            )
    else:
        print("\nAborted string replacement due to errors during file renaming.")

    print("Please review all changes carefully.")
