#!/usr/bin/env python3
"""
sh_inspect.py: Inspects shell environment information.

Identifies the current shell, checks for common configuration files,
and provides reminders about shell startup file load orders.
"""

import os
from typing import List, Tuple


def get_shell_info() -> Tuple[str, str]:
    """
    Identifies the current shell based on environment variables.

    Returns:
        A tuple containing the detected shell name (e.g., "Zsh", "Bash", "Other")
        and a version string or specific information if available.
    """
    bash_version = os.environ.get("BASH_VERSION")
    zsh_version = os.environ.get("ZSH_VERSION")
    # SHELL variable indicates the user's default login shell, not necessarily the current one.
    # For the current shell, examining parent processes is more reliable but complex.
    # We'll rely on shell-specific variables first.

    current_shell_path = os.environ.get("SHELL", "Unknown path")
    current_shell_name = os.path.basename(current_shell_path)

    if zsh_version:
        return "Zsh", f"v{zsh_version} (running)"
    elif bash_version:
        return "Bash", f"v{bash_version} (running)"
    elif "zsh" in current_shell_name.lower():
        return "Zsh", f"(inferred from $SHELL: {current_shell_path})"
    elif "bash" in current_shell_name.lower():
        return "Bash", f"(inferred from $SHELL: {current_shell_path})"
    else:
        return "Other", f"($SHELL: {current_shell_path})"


def check_config_files(home_dir: str) -> List[str]:
    """
    Checks for the existence of common shell config files in the specified directory.

    Args:
        home_dir: The directory to check (typically the user's home directory).

    Returns:
        A list of found configuration filenames.
    """
    files_to_check = [
        ".profile",
        ".bash_profile",
        ".bash_login",
        ".bashrc",
        ".zprofile",
        ".zshenv",
        ".zlogin",
        ".zshrc",
        # Adding common generic ones
        ".shrc",
        ".kshrc",
    ]
    found_files: List[str] = []
    for filename in files_to_check:
        filepath = os.path.join(home_dir, filename)
        if os.path.isfile(filepath):
            found_files.append(filename)
    return found_files


def print_load_order_reminders() -> None:
    """Prints typical load order for common shells."""
    print("\n--- Typical Shell Startup File Load Order Reminders ---")
    print("Bash:")
    print(
        "  Login Shell: /etc/profile -> ~/.bash_profile OR ~/.bash_login OR ~/.profile (first found)"
    )
    print("  Interactive Non-Login: /etc/bash.bashrc (if exists) -> ~/.bashrc")
    print("Zsh:")
    print("  All Zsh instances (login, interactive, scripts): /etc/zshenv -> ~/.zshenv")
    print(
        "  Login Shell (after zshenv): /etc/zprofile -> ~/.zprofile -> /etc/zshrc -> ~/.zshrc -> /etc/zlogin -> ~/.zlogin"
    )
    print("  Interactive Non-Login (after zshenv): /etc/zshrc -> ~/.zshrc")
    print(
        "\nNote: Actual files loaded depend on system configuration, shell version, invocation method, and file contents (e.g., sourcing other files)."
    )


def main() -> None:
    """Main execution function."""
    print("--- Shell Environment Inspector ---")

    shell_name, shell_details = get_shell_info()
    print(f"\nDetected Shell: {shell_name} {shell_details}")
    print(
        "(Detection of login/interactive status from Python is complex and often unreliable.)"
    )

    home_directory = os.path.expanduser("~")
    print(f"\n--- Checking Common Config Files in: {home_directory} ---")
    found = check_config_files(home_directory)
    if found:
        print("Found:")
        for f_name in sorted(found):
            print(f"  - {f_name}")
    else:
        print("  -> None of the commonly checked files found.")

    print_load_order_reminders()


if __name__ == "__main__":
    main()
