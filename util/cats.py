import sys
import os
import argparse


def concatenate_files_recursively(directory_path, output_file_path="cats.txt"):
    absolute_output_path = os.path.abspath(output_file_path)

    try:
        with open(output_file_path, "w", encoding="utf-8") as outfile:
            for root, _, files in os.walk(directory_path):
                for filename in files:
                    file_path = os.path.join(root, filename)
                    absolute_file_path = os.path.abspath(file_path)

                    if absolute_file_path == absolute_output_path:
                        continue

                    try:
                        outfile.write(f"\n{file_path}\n\n")
                        with open(
                            file_path, "r", encoding="utf-8", errors="ignore"
                        ) as infile:
                            outfile.write(infile.read())
                    except Exception as e:
                        print(
                            f"Warning: Skipping file {file_path} due to error: {e}",
                            file=sys.stderr,
                        )

        print(f"Successfully concatenated files into {output_file_path}")

    except IOError as e:
        print(f"Error writing to output file {output_file_path}: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Recursively concatenates files from a directory into cats.txt."
    )
    parser.add_argument(
        "directory", help="The directory to scan recursively for files."
    )

    args = parser.parse_args()
    target_directory = args.directory

    if not os.path.isdir(target_directory):
        print(f"Error: '{target_directory}' is not a valid directory.", file=sys.stderr)
        sys.exit(1)

    concatenate_files_recursively(target_directory)
