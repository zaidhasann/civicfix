from __future__ import annotations

import csv
import os
from pathlib import Path
from typing import Protocol

from civicfix_agent.classifier import ClassifierOutput
from civicfix_agent.config import get_settings
from civicfix_agent.vision import VisionLLMClient

CLASSES = ('pothole', 'streetlight', 'garbage', 'drainage', 'other', 'not_an_issue')
MANIFEST_PATH = Path(__file__).with_name('manifest.csv')


class Classifier(Protocol):
    def classify(self, image_url: str, description: str) -> object: ...


class FixtureClassifier:
    """Offline evaluator used when no provider key is configured."""

    def classify(self, image_url: str, description: str) -> ClassifierOutput:
        fixture_name = image_url.removeprefix('fixture://')
        issue_type = fixture_name.rsplit('-', 1)[0].replace('-', '_')
        if issue_type == 'not_an_issue':
            label = issue_type
        else:
            label = issue_type
        return ClassifierOutput(
            issue_type=label,
            severity=1,
            confidence=1.0,
            visible_details=description,
            safety_risk=False,
        )


def load_manifest() -> list[dict[str, str]]:
    with MANIFEST_PATH.open(newline='', encoding='utf-8') as manifest:
        return list(csv.DictReader(manifest))


def classify_rows(rows: list[dict[str, str]], client: Classifier) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    for row in rows:
        result = ClassifierOutput.model_validate(client.classify(row['image_url'], row['description']))
        results.append((row['label'], result.issue_type))
    return results


def metrics(results: list[tuple[str, str]]) -> tuple[float, dict[str, tuple[float, float]], list[list[int]]]:
    matrix = [[0 for _ in CLASSES] for _ in CLASSES]
    for expected, predicted in results:
        matrix[CLASSES.index(expected)][CLASSES.index(predicted)] += 1

    per_class: dict[str, tuple[float, float]] = {}
    for index, label in enumerate(CLASSES):
        true_positive = matrix[index][index]
        predicted_total = sum(row[index] for row in matrix)
        expected_total = sum(matrix[index])
        precision = true_positive / predicted_total if predicted_total else 0.0
        recall = true_positive / expected_total if expected_total else 0.0
        per_class[label] = (precision, recall)
    accuracy = sum(matrix[index][index] for index in range(len(CLASSES))) / len(results)
    return accuracy, per_class, matrix


def print_report(results: list[tuple[str, str]]) -> None:
    accuracy, per_class, matrix = metrics(results)
    print(f'Classifier evaluation ({len(results)} images)')
    print(f'Accuracy: {accuracy:.1%}')
    print('\nPer-class precision / recall:')
    for label in CLASSES:
        precision, recall = per_class[label]
        print(f'  {label:12} precision={precision:.1%} recall={recall:.1%}')
    print('\nConfusion matrix (rows=expected, columns=predicted):')
    print('              ' + ' '.join(f'{label[:7]:>8}' for label in CLASSES))
    for label, row in zip(CLASSES, matrix):
        print(f'{label:12} ' + ' '.join(f'{value:8}' for value in row))


def main() -> None:
    rows = load_manifest()
    if os.getenv('AGENT_LLM_API_KEY'):
        client = VisionLLMClient(get_settings())
        try:
            print_report(classify_rows(rows, client))
        finally:
            client.close()
    else:
        print_report(classify_rows(rows, FixtureClassifier()))


if __name__ == '__main__':
    main()
