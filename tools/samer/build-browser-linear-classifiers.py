#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.naive_bayes import ComplementNB, MultinomialNB
from sklearn.svm import LinearSVC


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/samer/classification-jobs-v1.json"
OUTPUT = ROOT / "public/data/simulatte-compact-classifiers.js"


def round_rows(rows):
    return [[round(float(value), 8) for value in row] for row in rows]


def round_values(values):
    return [round(float(value), 8) for value in values]


def label_prototype(job, label):
    readable = label.replace("-", " ")
    prototype = job.get("labelPrototype", {})
    if prototype.get("schema") != "simulatte.classificationLabelPrototype.v1":
        raise ValueError(f"{job['id']} labelPrototype schema is required")
    template = prototype.get("template", "")
    if template.count("{label}") < 1:
        raise ValueError(f"{job['id']} labelPrototype template must contain {{label}}")
    return template.replace("{label}", readable)


def training_rows(job, labels):
    texts = []
    targets = []
    for label in labels:
        readable = label.replace("-", " ")
        prototype = label_prototype(job, label)
        for text in (readable, prototype, f"Request evidence: {prototype}", f"Show {readable}"):
            texts.append(text)
            targets.append(label)
    return texts, targets


def model_row(model_id, model, score_kind, coefficients=None, intercepts=None, classes=None):
    return {
        "id": model_id,
        "scoreKind": score_kind,
        "classes": [str(value) for value in (classes if classes is not None else model.classes_)],
        "coefficients": round_rows(coefficients if coefficients is not None else model.coef_),
        "intercepts": round_values(intercepts if intercepts is not None else model.intercept_),
        "qualification": {
            "status": "evaluation-only-uncalibrated",
            "promotionEligible": False,
        },
    }


def build_head(job):
    labels = [label for label in job["labels"] if label not in job.get("scoredLabelsExclude", [])]
    texts, targets = training_rows(job, labels)
    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        analyzer="word",
        sublinear_tf=True,
    )
    vectors = vectorizer.fit_transform(texts)
    multinomial_nb = MultinomialNB(alpha=1.0).fit(vectors, targets)
    complement_nb = ComplementNB(alpha=1.0).fit(vectors, targets)
    linear_svc = LinearSVC(C=1.0, random_state=17).fit(vectors, targets)
    logistic = LogisticRegression(max_iter=400, random_state=17).fit(vectors, targets)
    sgd_modified_huber = SGDClassifier(
        loss="modified_huber",
        max_iter=1000,
        random_state=17,
        tol=1e-3,
    ).fit(vectors, targets)
    nb_svm_classes, nb_svm_coefficients, nb_svm_intercepts = train_nb_svm(vectors, targets)
    vocabulary = sorted(vectorizer.vocabulary_.items(), key=lambda row: row[1])
    return {
        "id": job["id"],
        "inputUnit": job["inputUnit"],
        "labels": job["labels"],
        "scoredLabelsExclude": job.get("scoredLabelsExclude", []),
        "labelPrototype": job["labelPrototype"],
        "labelPrototypes": [
            {"id": label, "text": label_prototype(job, label)} for label in labels
        ],
        "abstention": job["abstention"],
        "vectorizer": {
            "id": "simulatte.sklearn-tfidf-word-1-2.v1",
            "tokenPattern": "[a-z0-9]{2,}",
            "ngramRange": [1, 2],
            "sublinearTf": True,
            "norm": "l2",
            "vocabulary": [term for term, _index in vocabulary],
            "idf": round_values(vectorizer.idf_),
        },
        "models": {
            "multinomialNB": model_row(
                "simulatte.browser-multinomial-nb-tfidf.v1",
                multinomial_nb,
                "log-joint",
                coefficients=multinomial_nb.feature_log_prob_,
                intercepts=multinomial_nb.class_log_prior_,
            ),
            "complementNB": model_row(
                "simulatte.browser-complement-nb-tfidf.v1",
                complement_nb,
                "log-joint",
                coefficients=complement_nb.feature_log_prob_,
                intercepts=np.zeros(len(complement_nb.classes_)),
            ),
            "linearSVC": model_row(
                "simulatte.browser-linear-svc-tfidf.v1",
                linear_svc,
                "decision-function",
            ),
            "logisticRegression": model_row(
                "simulatte.browser-logistic-tfidf.v1",
                logistic,
                "softmax-logit",
            ),
            "sgdModifiedHuber": model_row(
                "simulatte.browser-sgd-modified-huber-tfidf.v1",
                sgd_modified_huber,
                "modified-huber-decision",
            ),
            "nbSvmLogistic": model_row(
                "simulatte.browser-nb-svm-logistic-tfidf.v1",
                logistic,
                "softmax-logit",
                coefficients=nb_svm_coefficients,
                intercepts=nb_svm_intercepts,
                classes=nb_svm_classes,
            ),
        },
    }


def train_nb_svm(vectors, targets):
    classes = sorted(set(targets))
    target_array = np.asarray(targets)
    coefficients = []
    intercepts = []
    for class_id in classes:
        positive = target_array == class_id
        negative = ~positive
        positive_rate = (1 + np.asarray(vectors[positive].sum(axis=0)).ravel()) / (1 + positive.sum())
        negative_rate = (1 + np.asarray(vectors[negative].sum(axis=0)).ravel()) / (1 + negative.sum())
        log_count_ratio = np.log(positive_rate / negative_rate)
        binary = positive.astype(int)
        classifier = LogisticRegression(max_iter=400, random_state=17).fit(
            vectors.multiply(log_count_ratio), binary
        )
        coefficients.append(classifier.coef_[0] * log_count_ratio)
        intercepts.append(classifier.intercept_[0])
    return classes, np.asarray(coefficients), np.asarray(intercepts)


def build_artifact():
    source_bytes = SOURCE.read_bytes()
    source = json.loads(source_bytes)
    return {
        "schema": "simulatte.browserCompactClassifierArtifact.v1",
        "id": "simulatte-browser-compact-classifiers-v1",
        "source": {
            "path": "tools/samer/classification-jobs-v1.json",
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
        },
        "generator": {
            "path": "tools/samer/build-browser-linear-classifiers.py",
            "sklearnVersion": sklearn.__version__,
        },
        "claimBoundary": "Browser-executable candidate weights trained from taxonomy descriptions. They are evaluation-only until candidate-specific calibration and a fresh sealed frontier qualify them.",
        "heads": [build_head(job) for job in source["jobs"]],
    }


def render(artifact):
    payload = json.dumps(artifact, separators=(",", ":"), ensure_ascii=True)
    return "\n".join((
        "// Generated by tools/samer/build-browser-linear-classifiers.py. Do not edit.",
        "(function attachSimulatteCompactClassifierArtifact(root, artifact) {",
        "  if (typeof module === 'object' && module.exports) module.exports = artifact;",
        "  root.SimulatteCompactClassifierArtifact = artifact;",
        f"}})(typeof globalThis !== 'undefined' ? globalThis : window, Object.freeze({payload}));",
        "",
    ))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render(build_artifact())
    if args.check:
        current = OUTPUT.read_text() if OUTPUT.exists() else ""
        if current != rendered:
            raise SystemExit("public/data/simulatte-compact-classifiers.js is stale")
        print("Browser compact classifier artifact is synchronized.")
        return
    OUTPUT.write_text(rendered)
    print("Wrote browser compact classifier artifact.")


if __name__ == "__main__":
    main()
