# Classifier evaluation

Run from `services/agent`:

```powershell
$env:PYTHONPATH = 'src'
python -m evals.classifier
```

The 30-row `manifest.csv` contains labeled fixture image identifiers covering
all six classifier classes. Without `AGENT_LLM_API_KEY`, the harness uses the
offline fixture client so CI and local development do not require provider
credentials. When that key is set, the configured vision provider is evaluated
against the same manifest.

The report includes accuracy, per-class precision and recall, and a confusion
matrix.
