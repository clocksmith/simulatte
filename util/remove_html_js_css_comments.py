import re
import argparse
import sys

def remove_comments(text):
    """Removes various comment types from a string containing HTML, CSS, and JS."""

    # Remove HTML comments: # Use re.DOTALL so '.' matches newline characters
    text = re.sub(r'', '', text, flags=re.DOTALL)

    # Remove multi-line /* ... */ comments (CSS/JS)
    # Use re.DOTALL and non-greedy matching .*?
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)

    # Remove single-line // comments (JS)
    # Process line by line effectively by matching until newline
    # This needs to be applied carefully AFTER multiline comments are gone.
    # We can simulate line-by-line by splitting, processing, and joining,
    # or apply a regex that targets // until the end of the line.
    # Let's use re.MULTILINE for ^ and $ matching line boundaries.
    text = re.sub(r'//.*', '', text) # Simpler approach: applies to remainder

    # Alternative for // (potentially safer but processes text line by line):
    # lines = text.splitlines()
    # cleaned_lines = [re.sub(r'//.*', '', line) for line in lines]
    # text = '\n'.join(cleaned_lines)

    return text

def main():
    """Main function to handle file reading, comment removal, and writing."""
    parser = argparse.ArgumentParser(
        description='Removes HTML, CSS, and JS comments from a file.'
    )
    parser.add_argument('input_file', help='Path to the input HTML file.')
    parser.add_argument('output_file', help='Path to save the cleaned output file.')

    # Handle potential parsing errors gracefully
    try:
        args = parser.parse_args()
    except SystemExit:
        # argparse already prints help or error messages
        sys.exit(1) # Exit with a non-zero code indicates error

    input_path = args.input_file
    output_path = args.output_file

    print(f"Attempting to read from: {input_path}")
    print(f"Attempting to write to: {output_path}")

    try:
        # Read the entire input file
        with open(input_path, 'r', encoding='utf-8') as infile:
            original_text = infile.read()
            print(f"Successfully read {len(original_text)} characters from {input_path}")

        # Remove comments
        cleaned_text = remove_comments(original_text)
        print("Comment removal process completed.")

        # Write the cleaned text to the output file
        with open(output_path, 'w', encoding='utf-8') as outfile:
            outfile.write(cleaned_text)
            print(f"Successfully wrote cleaned content ({len(cleaned_text)} characters) to {output_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at '{input_path}'", file=sys.stderr)
        sys.exit(1)
    except IOError as e:
        print(f"Error reading or writing file: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()