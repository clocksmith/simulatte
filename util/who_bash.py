#!/usr/bin/env python3

import os
import stat # To potentially add more file details later if needed

def get_shell_info():
    """Identifies the current shell based on environment variables."""
    bash_version = os.environ.get('BASH_VERSION')
    zsh_version = os.environ.get('ZSH_VERSION')
    shell_name_reported = os.path.basename(os.environ.get('SHELL', 'Unknown'))
    login_status_note = "(Login status detection from Python is complex/unreliable)"

    print("--- Shell Identification ---")
    if zsh_version:
        print(f"Detected Zsh (v{zsh_version}) {login_status_note}")
        return "Zsh"
    elif bash_version:
        print(f"Detected Bash (v{bash_version}) {login_status_note}")
        # Note: Checking shopt -q login_shell requires running bash itself
        return "Bash"
    else:
        print(f"Shell not detected as Bash or Zsh via specific variables.")
        print(f"Default shell ($SHELL env var): {shell_name_reported}")
        # Getting the *actual* running parent shell process reliably is tricky
        return "Other"

def check_config_files():
    """Checks for the existence of common shell config files in the home dir."""
    home_dir = os.path.expanduser('~')
    files_to_check = [
        ".profile", ".bash_profile", ".bash_login", ".bashrc",
        ".zprofile", ".zshenv", ".zlogin", ".zshrc"
    ]
    found_files = []

    print(f"\n--- Checking for Common Config Files in {home_dir} ---")
    for filename in files_to_check:
        filepath = os.path.join(home_dir, filename)
        if os.path.isfile(filepath):
            found_files.append(filename)
            # Could add os.stat(filepath) here for more details like permissions/size

    if found_files:
        print("Found:")
        for f in found_files:
            print(f"  {f}") # Use print(f"  {os.stat(os.path.join(home_dir, f))}") for more detail
    else:
        print(" -> None of the common files found.")

def print_reminder():
    """Prints the typical load order for common shells."""
    print("\n--- Load Order Reminder ---")
    print("Bash Login: /etc/profile -> ~/.bash_profile OR ~/.bash_login OR ~/.profile (first found)")
    print("Bash Interactive Non-Login: /etc/bash.bashrc -> ~/.bashrc")
    print("Zsh Always: /etc/zshenv -> ~/.zshenv")
    print("Zsh Login: /etc/zprofile -> ~/.zprofile -> /etc/zshrc -> ~/.zshrc -> /etc/zlogin -> ~/.zlogin")
    print("Zsh Interactive Non-Login: /etc/zshrc -> ~/.zshrc")
    print("\nNote: Actual files loaded depend on shell type (Bash/Zsh), mode (Login/Interactive), and file contents (e.g., sourcing).")

if __name__ == "__main__":
    get_shell_info()
    check_config_files()
    print_reminder()