# notebooks — recommender analysis (Phase R2)

| File | What it is |
|---|---|
| `recommendation.ipynb` | The analysis for the report: data overview, content model, rating prediction (baseline, item–item CF, SVD), association rules, Bayesian quality, weight search, test evaluation, examples, sentiment, export. Saved **with outputs**. |
| `recommendation.html` | The same notebook as a web page (open in any browser; no Python needed). |
| `reco_lib.py` | The reference implementation of every algorithm (RECOMMENDATION §4, §5, §9). The app's TypeScript engine (R3) must reproduce it. |
| `build_notebook.py` | Builds the notebook's cells (so the code is reviewable as plain Python). |
| `figures/*.png` | The charts, for the report and slides. |
| `requirements.txt` | Pinned packages (tested on Python 3.14.7). |

Outputs written to `data/reco/`: `reference_scores.json` (lists for the app's parity test) and `evaluation.json` (metrics).

**Run it:**
```bash
python3 -m venv notebooks/.venv
notebooks/.venv/bin/pip install -r notebooks/requirements.txt
cd notebooks
.venv/bin/python build_notebook.py
.venv/bin/jupyter nbconvert --to notebook --execute --inplace recommendation.ipynb   # about 35 s
.venv/bin/jupyter nbconvert --to html recommendation.ipynb
```
Or open it interactively: `.venv/bin/jupyter notebook recommendation.ipynb`. Re-running gives byte-identical `reference_scores.json` and `evaluation.json`.

All ratings are **demo data**; the metrics describe the generator's patterns, not real customer taste.
