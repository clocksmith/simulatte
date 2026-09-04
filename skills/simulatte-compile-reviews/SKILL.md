---
name: simulatte-compile-reviews
description: Compile an identified Simulatte human-review JSONL file into heuristics, candidate prompts, and a source-hash receipt.
---

# Simulatte Review Compilation

## Prerequisites

- Run from the Simulatte repository root.
- Identify the review directory; default is `artifacts/simulatte-human-reviews/`.
- Confirm that no review server is appending to `reviews.jsonl` during compilation.

## Procedure

1. Validate that each nonempty line in `reviews.jsonl` is JSON and record the input byte
   count and SHA-256.
2. Compile the reviews:

   ```bash
   npm run compile:reviews
   ```

   Set `SIMULATTE_REVIEW_DIR` only when the user supplied a different review directory.
3. Inspect:
   - `compiled-heuristics.json`
   - `training-candidates.json`
   - `calibration-receipt.json`

## Validation

All three outputs parse; their schemas are the expected Simulatte v1 schemas; review and
candidate counts are internally consistent; and `sourceReviewsSha256` in the receipt
matches the parsed source-review array used by the compiler.

## Stop Conditions

Stop when the source file is changing, contains malformed lines, or its directory is
ambiguous. Do not infer that generated heuristic suggestions are approved product policy,
training data, or deployment candidates.

## Outputs

The three compiled JSON artifacts plus source path/hash, review count, and validation
result.

## Side Effects

Rewrites compiled artifacts in the selected local review directory. It does not start the
training UI, modify source code, train a model, promote candidates, or deploy.
