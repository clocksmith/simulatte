#!/usr/bin/env python3
"""Candidate-only runtime for compact model screening.

This process receives sanitized workloads without gold labels. It may emit
predictions and measurements; the Node evaluator owns scoring and promotion.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import resource
import sys
import time
from pathlib import Path

os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("USE_TF", "0")

WORKLOAD_SCHEMA = "simulatte.modelCandidateWorkload.v1"
OUTPUT_SCHEMA = "simulatte.modelCandidatePredictions.v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out")
    parser.add_argument(
        "--mode",
        required=True,
        choices=(
            "deterministic-classification",
            "deterministic-retrieval",
            "deterministic-reranking",
            "linear-classification",
            "nli-classification",
            "embedding-classification",
            "sentence-embedding",
            "sequence-reranking",
            "causal-reranking",
        ),
    )
    parser.add_argument("--model-id")
    parser.add_argument("--revision")
    parser.add_argument("--pooling", choices=("mean", "last"), default="mean")
    parser.add_argument("--instruction", default="")
    parser.add_argument("--local-files-only", action="store_true")
    return parser.parse_args()


def load_workload(file_path: str) -> dict:
    with open(file_path, "r", encoding="utf-8") as handle:
        workload = json.load(handle)
    if workload.get("schema") != WORKLOAD_SCHEMA:
        fail("workload schema mismatch")
    if workload.get("task") not in ("classification", "embedding-retrieval", "reranking"):
        fail("unsupported task")
    if not workload.get("rows"):
        fail("workload rows are required")
    forbidden = {"expectedLabel", "relevantIds", "hardNegativeIds", "winnerId", "relevance", "mustRefuse"}
    if contains_forbidden_key(workload, forbidden):
        fail("candidate workload contains evaluator-owned gold labels")
    return workload


def contains_forbidden_key(value, forbidden: set[str]) -> bool:
    if isinstance(value, dict):
        return any(key in forbidden or contains_forbidden_key(child, forbidden) for key, child in value.items())
    if isinstance(value, list):
        return any(contains_forbidden_key(child, forbidden) for child in value)
    return False


def normalized_tokens(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", str(text or "").lower())
    return [token[:-1] if len(token) > 3 and token.endswith("s") else token for token in tokens if len(token) > 1]


def feature_vector(text: str) -> dict[str, float]:
    features: dict[str, float] = {}

    def add(key: str, weight: float) -> None:
        features[key] = features.get(key, 0.0) + weight

    tokens = normalized_tokens(text)
    for token in tokens:
        add(f"w:{token}", 1.0)
        padded = f"^{token}$"
        for size in (3, 4):
            for index in range(max(0, len(padded) - size + 1)):
                add(f"g:{padded[index:index + size]}", 0.38)
    for index in range(len(tokens) - 1):
        add(f"b:{tokens[index]}_{tokens[index + 1]}", 0.72)
    return features


def lexical_score(left: str, right: str) -> float:
    left_features = feature_vector(left)
    right_features = feature_vector(right)
    dot = sum(value * right_features.get(key, 0.0) for key, value in left_features.items())
    left_norm = math.sqrt(sum(value * value for value in left_features.values()))
    right_norm = math.sqrt(sum(value * value for value in right_features.values()))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


def run_deterministic(workload: dict, typed_boost: bool = False) -> tuple[list[dict], dict]:
    started = time.perf_counter()
    predictions = []
    samples = []
    for row in workload["rows"]:
        row_started = time.perf_counter()
        if workload["task"] == "classification":
            source = " ".join(filter(None, (row.get("text"), row.get("span"))))
            scores = sorted(
                (
                    {
                        "id": label["id"],
                        "score": lexical_score(source, " ".join(filter(None, (label["id"], label.get("description"))))),
                    }
                    for label in row["labels"]
                ),
                key=lambda item: (-item["score"], item["id"]),
            )
            top = scores[0]
            next_score = scores[1]["score"] if len(scores) > 1 else 0.0
            confidence = max(0.0, min(1.0, top["score"] - next_score * 0.35)) if top["score"] > 0 else 0.0
            predicted = top["id"] if confidence >= float(row.get("minimumConfidence", 0)) else row.get("abstentionId", "abstain")
            prediction = {"id": row["id"], "predictedLabel": predicted, "confidence": confidence, "scores": scores}
        else:
            query_tokens = set(normalized_tokens(row["query"]))
            scores = []
            for candidate in row["candidates"]:
                candidate_text = " ".join(filter(None, (candidate["id"], candidate.get("text"), " ".join(candidate.get("types", [])))))
                score = lexical_score(row["query"], candidate_text)
                if typed_boost:
                    score += sum(1 for value in candidate.get("types", []) if value.lower() in query_tokens) * 0.08
                scores.append({"id": candidate["id"], "score": min(1.0, score)})
            scores.sort(key=lambda item: (-item["score"], item["id"]))
            margin = scores[0]["score"] - (scores[1]["score"] if len(scores) > 1 else 0.0)
            prediction = {
                "id": row["id"],
                "ranking": [item["id"] for item in scores],
                "scores": scores,
                "refused": scores[0]["score"] < float(row.get("minimumScore", 0.08)) or margin < float(row.get("minimumMargin", 0.015)),
                "margin": margin,
            }
        duration = elapsed_ms(row_started)
        samples.append(duration)
        prediction["durationMs"] = duration
        predictions.append(prediction)
    return predictions, performance_receipt(elapsed_ms(started) - sum(samples), samples, 0)


def run_linear_classification(workload: dict) -> tuple[list[dict], dict]:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    started = time.perf_counter()
    grouped: dict[str, list[dict]] = {}
    for row in workload["rows"]:
        grouped.setdefault(row["headId"], []).append(row)
    models = {}
    for head_id, rows in grouped.items():
        labels = rows[0]["labels"]
        train_texts: list[str] = []
        train_labels: list[str] = []
        for label in labels:
            label_id = label["id"]
            description = label.get("description") or label_id.replace("-", " ")
            for template in (
                "{description}",
                "this request describes {description}",
                "the grounded visual class is {description}",
            ):
                train_texts.append(template.format(description=description))
                train_labels.append(label_id)
        vectorizer = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), analyzer="word", sublinear_tf=True)
        vectors = vectorizer.fit_transform(train_texts)
        classifier = LogisticRegression(max_iter=400, random_state=17).fit(vectors, train_labels)
        models[head_id] = (vectorizer, classifier)
    cold_ms = elapsed_ms(started)
    predictions = []
    samples = []
    for row in workload["rows"]:
        row_started = time.perf_counter()
        vectorizer, classifier = models[row["headId"]]
        text = " ".join(filter(None, (row.get("text"), row.get("span"))))
        probabilities = classifier.predict_proba(vectorizer.transform([text]))[0]
        scores = sorted(
            ({"id": label, "score": float(score)} for label, score in zip(classifier.classes_, probabilities)),
            key=lambda item: (-item["score"], item["id"]),
        )
        confidence = scores[0]["score"]
        predicted = scores[0]["id"] if confidence >= float(row.get("minimumConfidence", 0)) else row.get("abstentionId", "abstain")
        duration = elapsed_ms(row_started)
        samples.append(duration)
        predictions.append({"id": row["id"], "predictedLabel": predicted, "confidence": confidence, "scores": scores, "durationMs": duration})
    return predictions, performance_receipt(cold_ms, samples, 0)


def load_hf(model_id: str, revision: str, model_kind: str, local_files_only: bool):
    if not model_id or not revision:
        fail("model-backed modes require --model-id and --revision")
    import torch
    from huggingface_hub import snapshot_download
    from transformers import AutoModel, AutoModelForCausalLM, AutoModelForSequenceClassification, AutoTokenizer

    started = time.perf_counter()
    snapshot = snapshot_download(
        repo_id=model_id,
        revision=revision,
        local_files_only=local_files_only,
        allow_patterns=("*.json", "*.txt", "*.model", "*.safetensors"),
    )
    tokenizer_options = {
        "local_files_only": True,
        "padding_side": "left" if model_kind == "causal" else "right",
    }
    tokenizer_config_path = os.path.join(snapshot, "tokenizer_config.json")
    if os.path.exists(tokenizer_config_path):
        with open(tokenizer_config_path, "r", encoding="utf-8") as handle:
            tokenizer_config = json.load(handle)
        if isinstance(tokenizer_config.get("extra_special_tokens"), list):
            tokenizer_options["extra_special_tokens"] = {}
    tokenizer = AutoTokenizer.from_pretrained(snapshot, **tokenizer_options)
    model_class = {
        "base": AutoModel,
        "sequence": AutoModelForSequenceClassification,
        "causal": AutoModelForCausalLM,
    }.get(model_kind)
    if model_class is None:
        fail(f"unsupported Hugging Face model kind {model_kind}")
    model = model_class.from_pretrained(snapshot, local_files_only=True, dtype=torch.float32)
    model.to("cpu")
    materialize_model_storage(model)
    model.eval()
    return tokenizer, model, elapsed_ms(started), directory_bytes(snapshot)


def materialize_model_storage(model) -> None:
    """Detach safetensors mmap storage before Accelerate-backed CPU matmuls.

    PyTorch 2.9 on Apple arm64 can return non-finite GEMM output from otherwise
    finite mmap-backed tensors. A real copy is part of this runtime contract and
    is charged to cold-load time and peak memory.
    """
    import torch

    with torch.no_grad():
        for parameter in model.parameters():
            parameter.data = parameter.data.clone()
        for module in model.modules():
            for name, value in module.named_buffers(recurse=False):
                setattr(module, name, value.clone())


def run_nli_classification(workload: dict, model_id: str, revision: str, local_only: bool) -> tuple[list[dict], dict]:
    import torch

    tokenizer, model, cold_ms, download_bytes = load_hf(model_id, revision, "sequence", local_only)
    label_map = {str(key).lower(): int(value) for key, value in model.config.label2id.items()}
    entailment_index = next((value for key, value in label_map.items() if "entail" in key), None)
    if entailment_index is None:
        fail(f"{model_id} has no entailment label")
    predictions = []
    samples = []
    with torch.inference_mode():
        for row in workload["rows"]:
            row_started = time.perf_counter()
            labels = row["labels"]
            premise = " ".join(filter(None, (row.get("text"), row.get("span"))))
            hypotheses = [f"This text expresses {label.get('description') or label['id'].replace('-', ' ')}." for label in labels]
            encoded = tokenizer([premise] * len(labels), hypotheses, padding=True, truncation=True, max_length=512, return_tensors="pt")
            logits = model(**encoded).logits[:, entailment_index]
            probabilities = torch.softmax(logits, dim=0).cpu().tolist()
            scores = sorted(
                ({"id": label["id"], "score": float(score)} for label, score in zip(labels, probabilities)),
                key=lambda item: (-item["score"], item["id"]),
            )
            confidence = scores[0]["score"]
            predicted = scores[0]["id"] if confidence >= float(row.get("minimumConfidence", 0)) else row.get("abstentionId", "abstain")
            duration = elapsed_ms(row_started)
            samples.append(duration)
            predictions.append({"id": row["id"], "predictedLabel": predicted, "confidence": confidence, "scores": scores, "durationMs": duration})
    return predictions, performance_receipt(cold_ms, samples, download_bytes)


def mean_pool(hidden, attention_mask):
    import torch

    mask = attention_mask.unsqueeze(-1).expand(hidden.size()).float()
    return torch.sum(hidden * mask, dim=1) / torch.clamp(mask.sum(dim=1), min=1e-9)


def last_token_pool(hidden, attention_mask):
    import torch

    if bool((attention_mask[:, -1].sum() == attention_mask.shape[0]).item()):
        return hidden[:, -1]
    sequence_lengths = attention_mask.sum(dim=1) - 1
    batch_size = hidden.shape[0]
    return hidden[torch.arange(batch_size, device=hidden.device), sequence_lengths]


def pooled_embeddings(model, tokenizer, texts: list[str], pooling: str):
    import torch.nn.functional as functional

    encoded = tokenizer(texts, padding=True, truncation=True, max_length=2048, return_tensors="pt")
    output = model(**encoded)
    pooled = last_token_pool(output.last_hidden_state, encoded["attention_mask"]) if pooling == "last" else mean_pool(output.last_hidden_state, encoded["attention_mask"])
    return functional.normalize(pooled, p=2, dim=1)


def instructed_query(instruction: str, query: str) -> str:
    return f"Instruct: {instruction}\nQuery: {query}" if instruction else query


def run_embedding_classification(
    workload: dict,
    model_id: str,
    revision: str,
    local_only: bool,
    pooling: str,
    instruction: str,
) -> tuple[list[dict], dict]:
    import torch

    tokenizer, model, cold_ms, download_bytes = load_hf(model_id, revision, "base", local_only)
    predictions = []
    samples = []
    with torch.inference_mode():
        index_started = time.perf_counter()
        label_indexes = {}
        for row in workload["rows"]:
            key = row["headId"]
            labels = row["labels"]
            documents = [label.get("description") or label["id"].replace("-", " ") for label in labels]
            identity = tuple((label["id"], document) for label, document in zip(labels, documents))
            existing = label_indexes.get(key)
            if existing and existing[0] != identity:
                fail(f"classification head {key} changed its fixed label index within one workload")
            if not existing:
                label_indexes[key] = (identity, labels, pooled_embeddings(model, tokenizer, documents, pooling))
        cold_ms += elapsed_ms(index_started)
        for row in workload["rows"]:
            row_started = time.perf_counter()
            source = " ".join(filter(None, (row.get("text"), row.get("span"))))
            _, labels, label_embeddings = label_indexes[row["headId"]]
            query_embedding = pooled_embeddings(model, tokenizer, [instructed_query(instruction, source)], pooling)[0]
            similarities = label_embeddings @ query_embedding
            scores = sorted(
                ({"id": label["id"], "score": float(score)} for label, score in zip(labels, similarities.cpu().tolist())),
                key=lambda item: (-item["score"], item["id"]),
            )
            confidence = max(0.0, min(1.0, scores[0]["score"]))
            predicted = scores[0]["id"] if confidence >= float(row.get("minimumConfidence", 0)) else row.get("abstentionId", "abstain")
            duration = elapsed_ms(row_started)
            samples.append(duration)
            predictions.append({"id": row["id"], "predictedLabel": predicted, "confidence": confidence, "scores": scores, "durationMs": duration})
    return predictions, performance_receipt(cold_ms, samples, download_bytes)


def run_sentence_embedding(
    workload: dict,
    model_id: str,
    revision: str,
    local_only: bool,
    pooling: str,
    instruction: str,
) -> tuple[list[dict], dict]:
    import torch

    tokenizer, model, cold_ms, download_bytes = load_hf(model_id, revision, "base", local_only)
    predictions = []
    samples = []
    with torch.inference_mode():
        for row in workload["rows"]:
            row_started = time.perf_counter()
            texts = [instructed_query(instruction, row["query"]), *[candidate["text"] for candidate in row["candidates"]]]
            embeddings = pooled_embeddings(model, tokenizer, texts, pooling)
            scores_tensor = embeddings[1:] @ embeddings[0]
            scores = sorted(
                ({"id": candidate["id"], "score": float(score)} for candidate, score in zip(row["candidates"], scores_tensor.cpu().tolist())),
                key=lambda item: (-item["score"], item["id"]),
            )
            margin = scores[0]["score"] - (scores[1]["score"] if len(scores) > 1 else 0)
            refused = scores[0]["score"] < float(row.get("minimumScore", 0.15)) or margin < float(row.get("minimumMargin", 0.02))
            duration = elapsed_ms(row_started)
            samples.append(duration)
            predictions.append({"id": row["id"], "ranking": [item["id"] for item in scores], "scores": scores, "refused": refused, "durationMs": duration})
    return predictions, performance_receipt(cold_ms, samples, download_bytes)


def run_sequence_reranking(workload: dict, model_id: str, revision: str, local_only: bool) -> tuple[list[dict], dict]:
    import torch

    tokenizer, model, cold_ms, download_bytes = load_hf(model_id, revision, "sequence", local_only)
    predictions = []
    samples = []
    with torch.inference_mode():
        for row in workload["rows"]:
            row_started = time.perf_counter()
            queries = [row["query"]] * len(row["candidates"])
            passages = [candidate["text"] for candidate in row["candidates"]]
            encoded = tokenizer(queries, passages, padding=True, truncation=True, max_length=512, return_tensors="pt")
            logits = model(**encoded).logits
            scalar = logits[:, 0] if logits.shape[-1] == 1 else logits[:, -1]
            raw_scores = scalar.cpu().tolist()
            scores = sorted(
                ({"id": candidate["id"], "score": float(score)} for candidate, score in zip(row["candidates"], raw_scores)),
                key=lambda item: (-item["score"], item["id"]),
            )
            duration = elapsed_ms(row_started)
            samples.append(duration)
            predictions.append({"id": row["id"], "ranking": [item["id"] for item in scores], "scores": scores, "durationMs": duration})
    return predictions, performance_receipt(cold_ms, samples, download_bytes)


def run_causal_reranking(
    workload: dict,
    model_id: str,
    revision: str,
    local_only: bool,
    instruction: str,
) -> tuple[list[dict], dict]:
    import torch

    tokenizer, model, cold_ms, download_bytes = load_hf(model_id, revision, "causal", local_only)
    false_token_id = tokenizer.convert_tokens_to_ids("no")
    true_token_id = tokenizer.convert_tokens_to_ids("yes")
    if false_token_id is None or true_token_id is None:
        fail(f"{model_id} does not expose yes/no scoring tokens")
    prefix = (
        '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the '
        'Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n'
    )
    suffix = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
    prefix_tokens = tokenizer.encode(prefix, add_special_tokens=False)
    suffix_tokens = tokenizer.encode(suffix, add_special_tokens=False)
    task_instruction = instruction or "Given a visual-world request, rank evidence that best satisfies the requested concept and relation"
    predictions = []
    samples = []
    with torch.inference_mode():
        for row in workload["rows"]:
            row_started = time.perf_counter()
            pairs = [
                f"<Instruct>: {task_instruction}\n<Query>: {row['query']}\n<Document>: {candidate['text']}"
                for candidate in row["candidates"]
            ]
            encoded_rows = tokenizer(
                pairs,
                padding=False,
                truncation=True,
                max_length=2048 - len(prefix_tokens) - len(suffix_tokens),
                return_attention_mask=False,
            )["input_ids"]
            encoded_rows = [prefix_tokens + token_ids + suffix_tokens for token_ids in encoded_rows]
            encoded = tokenizer.pad({"input_ids": encoded_rows}, padding=True, return_tensors="pt")
            logits = model(**encoded).logits[:, -1, :]
            binary = torch.stack([logits[:, false_token_id], logits[:, true_token_id]], dim=1)
            probabilities = torch.nn.functional.log_softmax(binary, dim=1)[:, 1].exp().cpu().tolist()
            scores = sorted(
                ({"id": candidate["id"], "score": float(score)} for candidate, score in zip(row["candidates"], probabilities)),
                key=lambda item: (-item["score"], item["id"]),
            )
            duration = elapsed_ms(row_started)
            samples.append(duration)
            predictions.append({"id": row["id"], "ranking": [item["id"] for item in scores], "scores": scores, "durationMs": duration})
    return predictions, performance_receipt(cold_ms, samples, download_bytes)


def performance_receipt(cold_ms: float, samples: list[float], download_bytes: int) -> dict:
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak_bytes = int(rss if sys.platform == "darwin" else rss * 1024)
    return {
        "coldLoadMs": max(0.0, cold_ms),
        "warmLatencyMs": samples,
        "downloadBytes": int(download_bytes),
        "peakMemoryBytes": peak_bytes,
        "deviceId": "cpu",
        "dtype": "f32",
    }


def directory_bytes(directory: str) -> int:
    total = 0
    counted: set[str] = set()
    for root, _, files in os.walk(directory):
        for name in files:
            file_path = os.path.join(root, name)
            resolved = os.path.realpath(file_path)
            if resolved not in counted:
                counted.add(resolved)
                total += os.path.getsize(resolved)
    return total


def elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 6)


def fail(message: str):
    raise ValueError(f"Model candidate runtime invalid: {message}")


def main() -> None:
    args = parse_args()
    workload = load_workload(args.input)
    deterministic = args.mode.startswith("deterministic-")
    if args.mode == "deterministic-classification":
        if workload["task"] != "classification":
            fail("deterministic-classification requires a classification workload")
        rows, performance = run_deterministic(workload)
        model_id = None
    elif args.mode == "deterministic-retrieval":
        if workload["task"] != "embedding-retrieval":
            fail("deterministic-retrieval requires an embedding-retrieval workload")
        rows, performance = run_deterministic(workload)
        model_id = None
    elif args.mode == "deterministic-reranking":
        if workload["task"] != "reranking":
            fail("deterministic-reranking requires a reranking workload")
        rows, performance = run_deterministic(workload, typed_boost=True)
        model_id = None
    elif args.mode == "linear-classification":
        if workload["task"] != "classification":
            fail("linear-classification requires a classification workload")
        rows, performance = run_linear_classification(workload)
        model_id = "simulatte-public-taxonomy-linear-head-v1"
    elif args.mode == "nli-classification":
        if workload["task"] != "classification":
            fail("nli-classification requires a classification workload")
        rows, performance = run_nli_classification(workload, args.model_id, args.revision, args.local_files_only)
        model_id = args.model_id
    elif args.mode == "embedding-classification":
        if workload["task"] != "classification":
            fail("embedding-classification requires a classification workload")
        rows, performance = run_embedding_classification(
            workload, args.model_id, args.revision, args.local_files_only, args.pooling, args.instruction
        )
        model_id = args.model_id
    elif args.mode == "sentence-embedding":
        if workload["task"] != "embedding-retrieval":
            fail("sentence-embedding requires an embedding-retrieval workload")
        rows, performance = run_sentence_embedding(
            workload, args.model_id, args.revision, args.local_files_only, args.pooling, args.instruction
        )
        model_id = args.model_id
    elif args.mode == "sequence-reranking":
        if workload["task"] != "reranking":
            fail("sequence-reranking requires a reranking workload")
        rows, performance = run_sequence_reranking(workload, args.model_id, args.revision, args.local_files_only)
        model_id = args.model_id
    else:
        if workload["task"] != "reranking":
            fail("causal-reranking requires a reranking workload")
        rows, performance = run_causal_reranking(
            workload, args.model_id, args.revision, args.local_files_only, args.instruction
        )
        model_id = args.model_id
    result = {
        "schema": OUTPUT_SCHEMA,
        "candidateId": workload["candidateId"],
        "task": workload["task"],
        "kind": "deterministic-rules" if deterministic else "model-backed",
        "model": {"executed": not deterministic},
        "modelId": model_id,
        "revision": None if deterministic else args.revision,
        "runtime": {
            "id": "python-transformers-candidate-screen-v1",
            "python": sys.version.split()[0],
            "deviceId": "cpu",
            "dtype": "f32",
        },
        "rows": rows,
        "performance": performance,
    }
    serialized = json.dumps(result, indent=2, allow_nan=False) + "\n"
    if args.out:
        Path(args.out).write_text(serialized, encoding="utf-8")
    else:
        sys.stdout.write(serialized)


if __name__ == "__main__":
    main()
