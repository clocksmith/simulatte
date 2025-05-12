#!/usr/bin/env python3
"""
decomment.py: Removes HTML, CSS, and JavaScript comments from a file.
Supports:
- HTML comments: <!-- ... -->
- CSS/JS multi-line comments: /* ... */
- JS single-line comments: // ...
"""

import re
import argparse
import sys


def remove_comments(text: str) -> str:
    """
    Removes various comment types from a string.

    Args:
        text: The input string possibly containing HTML, CSS, and JS.

    Returns:
        The string with comments removed.
    """
    # 1. Remove HTML comments: <!-- ... -->
    # re.DOTALL allows '.' to match newline characters.
    processed_text = re.sub(r"", "", text, flags=re.DOTALL)

    # 2. Remove multi-line CSS/JS comments: /* ... */
    # Non-greedy '.*?' is crucial to handle multiple comments correctly.
    processed_text = re.sub(r"/\*.*?\*/", "", processed_text, flags=re.DOTALL)

    # 3. Remove single-line JS comments: // ...
    # This regex is simple and effective for // to end of line.
    # It's applied after others to avoid issues if // is inside /* */.
    # Note: This doesn't protect // inside string literals.
    # For truly robust JS parsing, a proper parser/lexer would be needed.
    processed_text = re.sub(r"//[^\r\n]*", "", processed_text)

    # Remove empty lines that might result from comment removal
    processed_text = "\n".join(
        line for line in processed_text.splitlines() if line.strip()
    )

    return processed_text


def main() -> None:
    """Main function to handle file reading, comment removal, and writing."""
    parser = argparse.ArgumentParser(
        description="Removes HTML, CSS, and JS comments from a file."
    )
    parser.add_argument("input_file", help="Path to the input file.")
    parser.add_argument("output_file", help="Path to save the cleaned output file.")

    args = parser.parse_args()

    try:
        with open(args.input_file, "r", encoding="utf-8") as infile:
            original_text = infile.read()

        cleaned_text = remove_comments(original_text)

        with open(args.output_file, "w", encoding="utf-8") as outfile:
            outfile.write(cleaned_text)

        print(f"Comments removed. Cleaned content saved to '{args.output_file}'")

    except FileNotFoundError:
        print(f"Error: Input file not found: '{args.input_file}'", file=sys.stderr)
        sys.exit(1)
    except IOError as e:
        print(f"Error reading or writing file: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
