#!/usr/bin/env python3
"""
b64cli.py: Manual Base64 encoding and decoding utility.

Encodes files to Base64 or decodes Base64 encoded files without
using Python's built-in 'base64' module.
"""

import sys
import os
import argparse
from typing import List, Optional

# Base64 character set
B64_CHARS: str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
# Padding character
PAD_CHAR: str = "="
# Reverse map for decoding
B64_REVERSE_MAP: dict[str, int] = {char: i for i, char in enumerate(B64_CHARS)}


def manual_base64_encode(input_bytes: bytes) -> str:
    """
    Encodes a byte string into Base64.

    Args:
        input_bytes: The byte string to encode.

    Returns:
        The Base64 encoded string.
    """
    encoded_chars: List[str] = []
    idx: int = 0
    len_bytes: int = len(input_bytes)

    while idx < len_bytes:
        byte1 = input_bytes[idx]
        idx += 1
        byte2 = input_bytes[idx] if idx < len_bytes else None
        idx += 1
        byte3 = input_bytes[idx] if idx < len_bytes else None
        idx += 1

        # Combine 3 bytes (24 bits) into an integer
        # b1 (MSB) ... b3 (LSB)
        bits = byte1 << 16
        if byte2 is not None:
            bits |= byte2 << 8
        if byte3 is not None:
            bits |= byte3

        # Extract four 6-bit chunks from the 24 bits
        encoded_chars.append(B64_CHARS[(bits >> 18) & 0x3F])
        encoded_chars.append(B64_CHARS[(bits >> 12) & 0x3F])

        if byte2 is None:  # Only 1 byte in the original chunk
            encoded_chars.append(PAD_CHAR)
            encoded_chars.append(PAD_CHAR)
        else:
            encoded_chars.append(B64_CHARS[(bits >> 6) & 0x3F])
            if byte3 is None:  # Only 2 bytes in the original chunk
                encoded_chars.append(PAD_CHAR)
            else:
                encoded_chars.append(B64_CHARS[bits & 0x3F])

    return "".join(encoded_chars)


def manual_base64_decode(encoded_str: str) -> bytes:
    """
    Decodes a Base64 string into bytes.

    Args:
        encoded_str: The Base64 string to decode.

    Returns:
        The decoded byte string.

    Raises:
        ValueError: If the input string contains invalid Base64 characters or
                    has invalid padding.
    """
    decoded_bytes = bytearray()
    clean_encoded_str = "".join(encoded_str.split())  # Remove all whitespace

    if not clean_encoded_str:
        return b""

    # Validate characters and padding before processing
    padding_count = clean_encoded_str.count(PAD_CHAR)
    if padding_count > 2:
        raise ValueError("Invalid padding: More than two padding characters.")

    str_len_no_padding = len(clean_encoded_str) - padding_count
    if (str_len_no_padding + padding_count) % 4 != 0:
        raise ValueError("Invalid Base64 string length (must be multiple of 4).")

    if (
        padding_count > 0
        and clean_encoded_str[-padding_count:] != PAD_CHAR * padding_count
    ):
        raise ValueError("Invalid padding: Padding characters not at the end.")

    # Process the string without padding first
    data_part = (
        clean_encoded_str[:-padding_count] if padding_count > 0 else clean_encoded_str
    )

    bits = 0
    bit_count = 0

    for char in data_part:
        if char not in B64_REVERSE_MAP:
            raise ValueError(f"Invalid Base64 character: '{char}'")

        value = B64_REVERSE_MAP[char]
        bits = (bits << 6) | value
        bit_count += 6

        if bit_count >= 8:
            bit_count -= 8
            byte_to_add = (bits >> bit_count) & 0xFF
            decoded_bytes.append(byte_to_add)
            bits &= (1 << bit_count) - 1  # Mask out the bits we've used

    # Final check on padding consistency
    if (
        padding_count == 1 and bit_count != 4
    ):  # Last 6-bit char was for 2 output bytes (4 bits remaining)
        raise ValueError(
            "Invalid padding: One padding char implies 4 bits remaining from last group."
        )
    if (
        padding_count == 2 and bit_count != 2
    ):  # Last 6-bit char was for 1 output byte (2 bits remaining)
        raise ValueError(
            "Invalid padding: Two padding chars imply 2 bits remaining from last group."
        )

    return bytes(decoded_bytes)


def main() -> None:
    """Main function to handle command-line arguments and processing."""
    parser = argparse.ArgumentParser(description="Manual Base64 Encoder/Decoder.")
    parser.add_argument(
        "operation",
        choices=["enco", "deco"],
        help="Operation to perform: 'enco' for encode, 'deco' for decode.",
    )
    parser.add_argument("input_file", help="Path to the input file.")
    parser.add_argument(
        "-o",
        "--output_file",
        help="Path to the output file (optional, auto-generated if not provided).",
    )
    parser.add_argument(
        "--no-wrap",
        action="store_true",
        help="For encoding, do not wrap output lines (default is 76 chars).",
    )

    args = parser.parse_args()

    if not os.path.exists(args.input_file):
        print(f"Error: Input file not found: '{args.input_file}'", file=sys.stderr)
        sys.exit(1)

    try:
        if args.operation == "enco":
            print(f"Encoding '{args.input_file}'...")
            with open(args.input_file, "rb") as f_in:
                input_data = f_in.read()

            encoded_data = manual_base64_encode(input_data)

            output_filename = args.output_file or args.input_file + ".b64"
            with open(output_filename, "w", encoding="ascii") as f_out:
                if args.no_wrap:
                    f_out.write(encoded_data)
                else:
                    line_length = 76
                    for i in range(0, len(encoded_data), line_length):
                        f_out.write(encoded_data[i : i + line_length] + "\n")
            print(f"Successfully encoded. Output saved to '{output_filename}'")

        elif args.operation == "deco":
            print(f"Decoding '{args.input_file}'...")
            with open(args.input_file, "r", encoding="ascii") as f_in:
                encoded_data_from_file = f_in.read()

            decoded_data = manual_base64_decode(encoded_data_from_file)

            if args.output_file:
                output_filename = args.output_file
            else:
                base, ext = os.path.splitext(args.input_file)
                if ext.lower() == ".b64":
                    output_filename = (
                        base + ".decoded" if not os.path.splitext(base)[1] else base
                    )
                else:
                    output_filename = args.input_file + ".decoded"

            # Ensure we don't overwrite original if names collide without ".b64"
            if os.path.abspath(output_filename) == os.path.abspath(args.input_file):
                output_filename += ".decoded_new"

            with open(output_filename, "wb") as f_out:
                f_out.write(decoded_data)
            print(f"Successfully decoded. Output saved to '{output_filename}'")

    except ValueError as e:
        print(f"Error during {args.operation}ding: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
