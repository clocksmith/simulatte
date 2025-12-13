# Simulatte

Browser-based game that teaches how language models work by turning next-token prediction into a round-based challenge.

Simulatte runs fully client-side using `@huggingface/transformers` with WebGPU acceleration when available and a WASM fallback when not.

Hosted version: `https://simulatte.world`

## How The Game Works

- Choose a starting prompt and a model.
- Each round shows the current context and a small set of candidate next tokens.
- You guess which token the model ranks highest.
- After you guess, Simulatte reveals:
  - The correct token
  - A probability chart for top predictions
  - Attention over the context when the backend provides it
- Your score is the number of correct rounds. Streaks unlock small achievements.

## What You Can Learn

- **Tokenization**: many "words" are multiple tokens; spaces and punctuation often matter.
- **Next-token prediction**: the model is not choosing a sentence, it is ranking the next token.
- **Sampling controls**: temperature, top-k, and top-p change which tokens remain plausible and how sharp the distribution is.
- **Probability mass**: watch how probability concentrates or spreads as context changes.
- **Attention**: when available, attention highlights which context positions influenced the current prediction. When it is not available, Simulatte uses a simple recency heuristic to keep the visualization usable.

## Ways To Explore

- Swap models and compare: smaller models often become uncertain sooner, larger ones stay coherent longer.
- Change the starting prompt to force different regimes: lists, code, dialogue, numbers, rare words.
- Use the sampling presets (Focused, Balanced, Creative) and observe how the probability chart changes.
- Compare attention sources: some models expose real attention weights, others do not. When they do not, Simulatte labels the visualization as synthetic and uses a recency heuristic.

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

## Models

Models are defined in `core/model-registry.js` and load from HuggingFace at runtime.

- Default model: `HuggingFaceTB/SmolLM2-360M-Instruct`
- WebGPU is preferred when supported; Simulatte falls back to WASM if WebGPU is unavailable.
- Some ONNX exports do not include attention tensors. In that case the UI marks attention as synthetic or unavailable.

## Notes

- First run downloads model weights and caches them in the browser.
- This repo follows a strict no-emoji policy. See `EMOJI.md`.

*Last updated: December 2025*
