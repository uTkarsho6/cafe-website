# Phase R2 — Recommendation: Python/ML notebook

**Status:** AWAITING TEAM VERIFICATION (2026-10-30)
**Branch:** `phase-r2` (from local `main` after the R1 merge). Not pushed; the live site is unchanged.
**Approval that started it:** "approved, go to Phase R2" (2026-10-30)

## 1. Requirements addressed
- **FR-069** Evaluation notebook: notebook part **verified**; the app parity test (TC-UNIT-140) follows in R3.
- Q-24 answered: Python 3.14.7 works (scikit-learn 1.9.1).

## 2. What was built
| File | Purpose |
|---|---|
| `notebooks/recommendation.ipynb` (+ `.html`) | The report notebook, saved with outputs: 31 cells, 7 charts |
| `notebooks/reco_lib.py` | Reference implementation of every algorithm (RECOMMENDATION §4, §5, §9). R3's TypeScript must reproduce it |
| `notebooks/build_notebook.py` | Builds the notebook cells from plain Python (reviewable) |
| `notebooks/figures/01…07_*.png` | Charts for the report and slides |
| `notebooks/requirements.txt`, `notebooks/README.md` | Pinned packages; how to run |
| `data/reco/reference_scores.json` | Top-10 COMPLEMENT and SIMILAR lists for all 65 dishes with score components, plus quality per daypart (parity file for R3) |
| `data/reco/evaluation.json` | All metrics and the chosen weights |
| `data/reco/stopwords.txt` | The fixed TF-IDF stop-word list (scikit-learn's 318), shared with the app |
| Config | `.gitignore` (venv, caches), `.prettierignore` and ESLint ignore for generated `notebooks/` and `data/reco/` |

**Notebook sections:**
1. Data overview: star mix against your file, distributions, daypart heatmap.
2. Content model.
3. Hash-based train / validation / test split.
4. Rating prediction: baselines, item–item CF and SVD.
5. Visit association rules (support, confidence, lift).
6. Bayesian quality score.
7. Weight grid search with the coverage rule.
8. Test evaluation against baselines.
9. Example lists.
10. Optional sentiment classifier.
11. Export.
12. Limitations.

## 3. Results (demo data; test split = 20 % of visits)
**"Goes well with" / "You may also like", HitRate@5:**

| Method | Goes well with | You may also like |
|---|---|---|
| Random | 0.143 | 0.238 |
| Popularity | 0.245 | 0.376 |
| Content only | 0.185 | 0.365 |
| Co-occurrence only / CF only | 0.460 | 0.337 |
| **Hybrid (website)** | **0.457** | **0.403** |

- Precision@5 / Recall@5 for "Goes well with" (hybrid): 0.098 / 0.389.
- Coverage@5: 95.4 % of dishes appear in some top-5 list.
- **Rating prediction (test RMSE):** global mean 0.959 · dish mean 0.897 · user mean 1.119 · baseline 0.902 · item CF 0.909 · SVD 0.902.
- **Sentiment classifier:** accuracy 1.000. Expected, because the demo comments come from templates; the notebook says so.
- **Example lists:**
  - Korean Burger → goes well with Korean Cheesy Fries, Korean Mojito, …
  - Margherita → you may also like Korean Pizza, Italian Treat, Pizza Di Sicilia, …
  - Premium Cold Coffee → Strong Cold Coffee, Hot Coffee, …

## 4. Decisions (ADR-073)
1. **CF on baseline residuals.** With plain user-mean centring, CF predicted ratings worse than the overall average (RMSE 1.25 against 0.96). A damped baseline predictor (`μ + b_u + b_i`) plus a damped CF correction brings CF to 0.909, still not better than the baseline (0.902). This is reported honestly as a sparsity finding (about 6 ratings per user). The website does not use rating prediction.
2. **Coverage rule for the weights.** On HitRate alone, the search picked a 90 %-popularity "You may also like": nearly the same dishes on every page, 45 % coverage. The rule is now the best validation HitRate@5 among weights with coverage@5 ≥ 60 %.
   - Chosen: "Goes well with" co-occurrence / quality / content = **600 / 300 / 100**; "You may also like" content / taste / quality = **600 / 100 / 300**.
   - These become the `RecoSettings` defaults in R3 (a small migration).
3. **Exact diversity rule** (replaces R0's vaguer wording): MMR with λ = 0.7 on content similarity; at most 2 dishes per category in "You may also like" and 3 in "Goes well with"; ties broken by slug.

## 5. Commands executed and results
| Command | Result |
|---|---|
| `python3 -m venv notebooks/.venv` + `pip install` (pandas 3.1.0, numpy 2.5.4, scikit-learn 1.9.1, matplotlib 3.11.2, nbformat, nbconvert, ipykernel) | PASS |
| `jupyter nbconvert --execute --inplace recommendation.ipynb` | PASS (0 errors, 0 stderr outputs, 7 inline charts, about 35 s) |
| Rerun, then `shasum` of `reference_scores.json` and `evaluation.json` | PASS (identical) |
| **TC-NB-001:** brand-new venv from `requirements.txt`, its own kernel | PASS (`reference_scores.json` byte-identical) |
| Check for local paths or username in committed notebook, HTML and JSON files | PASS (none) |
| `npm run check` (lint, typecheck, format, unit, build) | PASS (362 tests; build OK), after excluding `notebooks/**` from ESLint (it was linting third-party JavaScript inside the venv) |
| gitleaks on `notebooks/` and `data/` | PASS (no leaks found) |
| Integration / E2E | NOT RUN (no app code changed in R2) |

## 6. Security and privacy
- No app code, routes or database changes in this phase.
- The notebook reads only the committed demo CSVs.
- Committed files contain no secrets (gitleaks) and no local paths.
- The venv is git-ignored.

## 7. Known issues and limitations
- **Demo data only.** The metrics describe the generator's patterns, not real taste (stated in the notebook, §12; Q-23 for the guide).
- **"Goes well with":** the hybrid doesn't beat co-occurrence alone on HitRate (0.457 against 0.460). Its benefit is that every dish gets a complete, varied list, including dishes without co-occurrence data.
- **A mistake I fixed:** while setting up, I registered a Jupyter kernel in your user folder (`~/Library/Jupyter/kernels/python3`). It wasn't needed and made the first clean-venv test unreliable, so I removed it and repeated the test.
- **Not merged:** local `main` contains R1's migration and must not be pushed before the production migration (R5).

## 8. Self-verification
- Read every notebook output and checked that the numbers make sense against the baselines.
- Viewed the charts (weight search, hit rates).
- Ran the notebook three times (twice in the project venv, once in a clean venv) with identical exports.
- Ran the full project check.

## 9. Next phase
**R3 — TypeScript engine and APIs:**
- `src/server/reco/*` reproducing `reco_lib.py` exactly (TC-UNIT-140 against `reference_scores.json`);
- `npm run reco:train` with versioned model runs, the quality gate and activation;
- the read path (curated links first, read-time filters, fallbacks, reason chips);
- `GET /api/v1/menu/[slug]/recommendations` and `/api/v1/recommendations/suggest`;
- a migration for the tuned default weights.

---

## HOW TO TEST THIS PHASE

1. **Look at the notebook without installing anything:** open `notebooks/recommendation.html` in a browser. Check:
   - the star-mix chart (§1);
   - the rating-prediction table (§4);
   - the weight-search chart and the coverage rule (§7);
   - the test tables (§8);
   - the example lists (§9).
2. **Run it yourself** (about 2 minutes the first time):
   ```bash
   cd ~/projects/zorko-sangli && git switch phase-r2
   python3 -m venv notebooks/.venv
   notebooks/.venv/bin/pip install -r notebooks/requirements.txt
   cd notebooks && .venv/bin/jupyter nbconvert --to notebook --execute --inplace recommendation.ipynb
   cd .. && git status --short data/reco     # expect: no changes (same results)
   ```
3. **Open it interactively** (optional): `notebooks/.venv/bin/jupyter notebook notebooks/recommendation.ipynb`.
4. **For the report:** the charts are in `notebooks/figures/`, and the numbers in `data/reco/evaluation.json` and §3 above.
5. **Ask your guide Q-23:** is evaluating on synthetic feedback acceptable, with the limitation stated?

**Not bugs:**
- The sentiment accuracy of 1.000 is expected with templated comments.
- CF not beating the baseline is a real finding about sparse data, not an error.
- Nothing changes on the website in this phase.

**If something fails:** send the command and its last 30 lines of output.

---

## Correction found in Phase R3 (2026-10-30)

The R3 parity test (TypeScript engine vs this notebook) found a bug in `notebooks/reco_lib.py`: pandas read the `is_best_seller` / `is_trending` columns as booleans, and the code compared them to the text `"true"`, so **the notebook ignored all best-seller and trending flags**. It was fixed and the notebook re-run.

The weight objective was also changed, from "best HitRate with coverage ≥ 60 %" to "maximise HitRate × coverage", because with the flags counted the old rule produced generic lists (ADR-074).

**Results that replace §3 and §4 above:**
- **Weights:** "Goes well with" co-occurrence / quality / content = 500 / 0 / 500; "You may also like" content / taste / quality = 500 / 200 / 300.
- **"Goes well with" HitRate@5:** hybrid 0.423; co-occurrence alone 0.453; popularity 0.234; random 0.143.
- **"You may also like" HitRate@5:** hybrid 0.387; popularity 0.370; content 0.365; CF 0.348; random 0.238.
- **Coverage@5:** 98.5 %.
- **Rating prediction:** unchanged.

`notebooks/recommendation.ipynb` / `.html`, `data/reco/evaluation.json` and `reference_scores.json` are the corrected versions.
