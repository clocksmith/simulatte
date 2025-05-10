#!/usr/bin/env python3
"""
txt2htmltags.py: Converts a text file into an HTML file.

Each character in the input text is wrapped in <x-x> tags,
words in <y-y> tags, and lines in <z-z> tags.
Line breaks in the text file are converted to <br> tags in HTML.
The output HTML links to 'style.css' and 'main.js'.
"""

import argparse
import sys
import html  # For escaping characters if needed, though not strictly used here for <x-x> content


def create_tagged_html_from_text(txt_content: str) -> str:
    """
    Generates HTML content with custom tags wrapping characters, words, and lines.

    Args:
        txt_content: The string content from the input text file.

    Returns:
        A string containing the HTML body content with custom tags.
    """
    tagged_body_content = []
    lines = txt_content.splitlines()

    for line_text in lines:
        tagged_body_content.append("<z-z>")
        words = line_text.split(" ")  # Simple space split
        for word_idx, word_text in enumerate(words):
            tagged_body_content.append("  <y-y>")
            if not word_text:  # Handle multiple spaces creating empty "words"
                if (
                    word_idx < len(words) - 1
                ):  # Add a space if it's not the last "empty word"
                    tagged_body_content.append(
                        f"    <x-x> </x-x>"
                    )  # Non-breaking space for explicit space
            else:
                for char_val in word_text:
                    # Escape special HTML characters if char_val were to be displayed directly
                    # For <x-x>content</x-x>, if content can be <, >, &, it should be escaped.
                    # Assuming simple characters here as per original script.
                    safe_char = html.escape(char_val)
                    tagged_body_content.append(f"    <x-x>{safe_char}</x-x>")

            # Add space between words, also wrapped
            if word_idx < len(words) - 1:
                tagged_body_content.append(
                    f"    <x-x> </x-x>"
                )  # Represent space explicitly
            tagged_body_content.append("  </y-y>")
        tagged_body_content.append("</z-z><br />")  # XHTML style <br />

    return "\n".join(tagged_body_content)


def main() -> None:
    """Main function to handle file processing and HTML generation."""
    parser = argparse.ArgumentParser(
        description="Generate HTML with custom character/word/line tags from a text file."
    )
    parser.add_argument("input_file", type=str, help="Path to the input text file.")
    parser.add_argument(
        "--output_file",
        "-o",
        type=str,
        default="index.html",
        help="Path to the output HTML file (default: index.html).",
    )
    parser.add_argument(
        "--title",
        type=str,
        default="Tagged Text Output",
        help="Title for the HTML document (default: Tagged Text Output).",
    )

    args = parser.parse_args()

    try:
        with open(args.input_file, "r", encoding="utf-8") as f:
            text_content = f.read()
    except FileNotFoundError:
        print(f"Error: Input file not found at '{args.input_file}'", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        sys.exit(1)

    body_html = create_tagged_html_from_text(text_content)

    full_html_output = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(args.title)}</title>
    <link rel="stylesheet" href="style.css">
    <!-- Note: These custom elements <x-x>, <y-y>, <z-z> are non-standard.
         They might require JavaScript for behavior or specific CSS for styling.
         Consider using <span> with classes for semantic HTML and styling flexibility. -->
</head>
<body>
    <div class="container">
{body_html}
    </div>
    <script src="main.js" defer></script>
</body>
</html>
"""

    try:
        with open(args.output_file, "w", encoding="utf-8") as html_file:
            html_file.write(full_html_output)
        print(f"Successfully generated HTML: '{args.output_file}'")
    except Exception as e:
        print(f"Error writing HTML file: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
