"""
ZORKO Sangli food recommender: reference implementation (Phase R2).

This module is the exact specification of the algorithms in docs/RECOMMENDATION.md §4–5 and §9.
The notebook (recommendation.ipynb) imports it for analysis and the report; the TypeScript engine
in the app (Phase R3) must reproduce `train()` exactly (TC-UNIT-140 compares against
data/reco/reference_scores.json, which `export_reference()` writes).

Rules that matter for parity with TypeScript:
- Every loop over dishes runs in a fixed order (slug, ascending); ties are broken by slug.
- No library randomness: the train/test split uses an FNV-1a hash of the visit id.
- TF-IDF follows scikit-learn's formula, with the token pattern and stop words fixed below.

All data is DEMO data (data/reco/README.md).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "reco"

SEED = 2026
TOKEN_PATTERN = r"[a-z0-9]{2,}"
ROLES = ["MAIN", "SIDE", "DRINK", "DESSERT"]
TAGS = ["SPICY", "CHEESY", "KOREAN", "PERI_PERI", "ITALIAN", "MEXICAN", "SMOKY", "PANEER",
        "CREAMY", "FRUITY", "CHOCOLATE", "COFFEE", "MINTY"]
DAYPARTS = ["LUNCH", "AFTERNOON", "EVENING"]
WINDOWS = ["ALL"] + DAYPARTS

# §4.1 block weights
BLOCK_WEIGHTS = {"category": 1.0, "role": 0.5, "tags": 1.5, "price": 0.5, "text": 1.0}
# §4.2–4.4 constants
TASTE_SHRINK_BETA = 10.0
TASTE_MIN_COMMON = 3
# Baseline predictor b_ui = μ + b_u + b_i with damping (Koren 2008); CF runs on the residuals.
BASELINE_LAMBDA_ITEM = 10.0
BASELINE_LAMBDA_USER = 15.0
CF_NEIGHBOURS = 20
# Damping of the CF correction (Σ s·r / (Σ s + λ)); chosen on the validation split in the notebook.
CF_DAMPING = 2.0
COOC_ALPHA = 5.0
COOC_MIN_PAIRS = 3
COOC_MIN_RATING = 3
BAYES_M = 10.0
TOP_N = 10
MMR_LAMBDA = 0.7
MAX_PER_CATEGORY = {"SIMILAR": 2, "COMPLEMENT": 3}

# Default weights in per-mille (RecoSettings defaults, §4.5)
DEFAULT_WEIGHTS = {
    "compCoocPm": 600, "compQualityPm": 250, "compContentPm": 150,
    "simContentPm": 500, "simTastePm": 300, "simQualityPm": 200,
}


# ---------------------------------------------------------------- data loading

def load_stopwords() -> list[str]:
    lines = (DATA / "stopwords.txt").read_text(encoding="utf-8").splitlines()
    return [w for w in lines if w and not w.startswith("#")]


def load_menu() -> pd.DataFrame:
    m = pd.read_csv(DATA / "menu_items.csv", keep_default_na=False)
    m["flavor_tags"] = m["flavor_tags"].map(lambda s: [t for t in s.split("|") if t])
    m["is_best_seller"] = m["is_best_seller"].astype(str) == "true"
    m["is_trending"] = m["is_trending"].astype(str) == "true"
    return m.sort_values("item_slug").reset_index(drop=True)


def daypart_of(timestamp: str) -> str:
    """IST wall-clock "YYYY-MM-DD HH:MM:SS" → daypart (LUNCH 11–13, AFTERNOON 14–16, EVENING 17–21)."""
    hour = int(timestamp[11:13])
    return "LUNCH" if hour < 14 else "AFTERNOON" if hour < 17 else "EVENING"


def load_feedback(path: Path | None = None) -> pd.DataFrame:
    f = pd.read_csv(path or DATA / "demo_feedback.csv", keep_default_na=False)
    f["daypart"] = f["timestamp"].map(daypart_of)
    return f


# ---------------------------------------------------------------- deterministic split (§9)

def fnv1a32(text: str) -> int:
    h = 0x811C9DC5
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def is_test_visit(visit_id: int, salt: str = "test", seed: int = SEED) -> bool:
    """20 % of visits (hash mod 5 == 0). `salt` gives an independent split (e.g. "valid")."""
    return fnv1a32(f"{seed}:{salt}:{visit_id}") % 5 == 0


def split_by_visit(feedback: pd.DataFrame, salt: str = "test") -> tuple[pd.DataFrame, pd.DataFrame]:
    mask = feedback["visit_id"].map(lambda v: is_test_visit(int(v), salt))
    return feedback[~mask].copy(), feedback[mask].copy()


# ---------------------------------------------------------------- §4.1 content similarity

def price_band(price_rupees: float) -> str:
    # Same bands as the menu filter (ADR-022): under 100, 100–200 inclusive, above 200.
    return "under-100" if price_rupees < 100 else "100-200" if price_rupees <= 200 else "200-plus"


def _l2(block: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(block, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return block / norms


def content_vectors(menu: pd.DataFrame, stopwords: list[str] | None = None) -> np.ndarray:
    """Weighted, block-normalised item vectors in `menu` row order (slug-sorted)."""
    categories = sorted(menu["category"].unique())
    bands = ["under-100", "100-200", "200-plus"]
    cat = np.array([[1.0 if c == x else 0.0 for x in categories] for c in menu["category"]])
    role = np.array([[1.0 if r == x else 0.0 for x in ROLES] for r in menu["meal_role"]])
    tags = np.array([[1.0 if t in ts else 0.0 for t in TAGS] for ts in menu["flavor_tags"]])
    price = np.array([[1.0 if price_band(p) == b else 0.0 for b in bands] for p in menu["price_rupees"]])
    tfidf = TfidfVectorizer(
        lowercase=True,
        token_pattern=TOKEN_PATTERN,
        stop_words=stopwords if stopwords is not None else load_stopwords(),
        smooth_idf=True,
        sublinear_tf=False,
        norm="l2",
    )
    text = tfidf.fit_transform((menu["item_name"] + " " + menu["description"]).tolist()).toarray()
    blocks = [
        _l2(cat) * BLOCK_WEIGHTS["category"],
        _l2(role) * BLOCK_WEIGHTS["role"],
        _l2(tags) * BLOCK_WEIGHTS["tags"],
        _l2(price) * BLOCK_WEIGHTS["price"],
        _l2(text) * BLOCK_WEIGHTS["text"],
    ]
    return np.hstack(blocks)


def content_similarity(vectors: np.ndarray) -> np.ndarray:
    v = _l2(vectors)
    sim = np.clip(v @ v.T, 0.0, 1.0)
    np.fill_diagonal(sim, 0.0)
    return sim


# ---------------------------------------------------------------- §4.2 taste similarity (item-item CF)

def rating_matrix(ratings: pd.DataFrame, slugs: list[str]) -> tuple[np.ndarray, list[int]]:
    """Users × items matrix (NaN = not rated) and the user ids (sorted)."""
    users = sorted(ratings["user_id"].unique().tolist())
    ui = {u: k for k, u in enumerate(users)}
    ii = {s: k for k, s in enumerate(slugs)}
    mat = np.full((len(users), len(slugs)), np.nan)
    for u, s, r in ratings[["user_id", "item_slug", "rating"]].itertuples(index=False):
        if s in ii:
            mat[ui[u], ii[s]] = float(r)
    return mat, users


@dataclass
class Baseline:
    """b_ui = mu + b_u + b_i, damped towards 0 for users/dishes with few ratings."""
    mu: float
    b_item: np.ndarray
    b_user: np.ndarray

    def predict(self, user_index: int, item: int) -> float:
        bu = self.b_user[user_index] if user_index >= 0 else 0.0
        return self.mu + bu + self.b_item[item]


def baseline(mat: np.ndarray) -> Baseline:
    rated = ~np.isnan(mat)
    mu = float(np.nanmean(mat)) if rated.any() else 3.0
    dev = np.where(rated, mat - mu, 0.0)
    b_item = dev.sum(axis=0) / (BASELINE_LAMBDA_ITEM + rated.sum(axis=0))
    dev_u = np.where(rated, mat - mu - b_item[None, :], 0.0)
    b_user = dev_u.sum(axis=1) / (BASELINE_LAMBDA_USER + rated.sum(axis=1))
    return Baseline(mu, b_item, b_user)


def residuals(mat: np.ndarray, base: Baseline) -> np.ndarray:
    """r_ui − b_ui where rated, NaN elsewhere."""
    expected = base.mu + base.b_user[:, None] + base.b_item[None, :]
    return mat - expected


def taste_raw(res: np.ndarray) -> np.ndarray:
    """Shrunk cosine of baseline residuals over co-raters, signed. Diagonal 0 (§4.2)."""
    rated = ~np.isnan(res)
    c = np.where(rated, res, 0.0)
    n_items = res.shape[1]
    sim = np.zeros((n_items, n_items))
    for i in range(n_items):
        for j in range(i + 1, n_items):
            both = rated[:, i] & rated[:, j]
            n = int(both.sum())
            if n < TASTE_MIN_COMMON:
                continue
            a, b = c[both, i], c[both, j]
            den = math.sqrt(float((a * a).sum())) * math.sqrt(float((b * b).sum()))
            if den == 0:
                continue
            s = float((a * b).sum()) / den * (n / (n + TASTE_SHRINK_BETA))
            sim[i, j] = sim[j, i] = s
    return sim


def per_source_normalise(scores: np.ndarray) -> np.ndarray:
    out = np.zeros_like(scores)
    for i in range(scores.shape[0]):
        top = scores[i].max()
        if top > 0:
            out[i] = scores[i] / top
    return out


def taste_similarity(raw: np.ndarray) -> np.ndarray:
    """§4.2 for the lists: negatives dropped, divided by the row maximum."""
    return per_source_normalise(np.clip(raw, 0.0, None))


def predict_rating(raw: np.ndarray, res: np.ndarray, base: Baseline, user_index: int, item: int,
                   damping: float = CF_DAMPING) -> float:
    """b_ui + Σ s·residual / (Σ s + λ) over the user's CF_NEIGHBOURS most similar (positive) rated dishes."""
    pred = base.predict(user_index, item)
    if user_index >= 0:
        rated = np.where(~np.isnan(res[user_index]))[0]
        rated = rated[rated != item]
        sims = raw[item, rated]
        keep = sims > 0
        rated, sims = rated[keep], sims[keep]
        if len(rated):
            order = np.argsort(-sims, kind="stable")[:CF_NEIGHBOURS]
            w, r = sims[order], res[user_index, rated[order]]
            pred += float((w * r).sum() / (w.sum() + damping))
    return float(min(5.0, max(1.0, pred)))


# ---------------------------------------------------------------- §4.3 visit co-occurrence

@dataclass
class CoocStats:
    n_i: np.ndarray
    n_ij: np.ndarray
    visits: int
    confidence: np.ndarray
    lift: np.ndarray


def cooccurrence(ratings: pd.DataFrame, slugs: list[str]) -> CoocStats:
    ii = {s: k for k, s in enumerate(slugs)}
    enjoyed = ratings[ratings["rating"] >= COOC_MIN_RATING]
    baskets = [sorted(ii[s] for s in g["item_slug"] if s in ii)
               for _, g in enjoyed.groupby("visit_id", sort=True)]
    baskets = [b for b in baskets if b]
    n = len(slugs)
    n_i = np.zeros(n)
    n_ij = np.zeros((n, n))
    for b in baskets:
        for x in b:
            n_i[x] += 1
        for x in b:
            for y in b:
                if x != y:
                    n_ij[x, y] += 1
    v = len(baskets)
    conf = np.zeros((n, n))
    lift = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i == j or n_ij[i, j] == 0:
                continue
            lift[i, j] = n_ij[i, j] * v / (n_i[i] * n_i[j])
            if n_ij[i, j] >= COOC_MIN_PAIRS and lift[i, j] > 1.0:
                conf[i, j] = n_ij[i, j] / (n_i[i] + COOC_ALPHA)
    return CoocStats(n_i, n_ij, v, conf, lift)


# ---------------------------------------------------------------- §4.4 quality

def bayesian_average(ratings: pd.DataFrame, slugs: list[str]) -> np.ndarray:
    mu = float(ratings["rating"].mean()) if len(ratings) else 3.0
    agg = ratings.groupby("item_slug")["rating"].agg(["sum", "count"])
    out = np.full(len(slugs), mu)
    for k, s in enumerate(slugs):
        if s in agg.index:
            out[k] = (BAYES_M * mu + agg.at[s, "sum"]) / (BAYES_M + agg.at[s, "count"])
    return out


def minmax(x: np.ndarray) -> np.ndarray:
    lo, hi = float(x.min()), float(x.max())
    return (x - lo) / (hi - lo) if hi > lo else np.zeros_like(x)


def flags(menu: pd.DataFrame) -> np.ndarray:
    return np.array([1.0 if b else 0.6 if t else 0.0
                     for b, t in zip(menu["is_best_seller"], menu["is_trending"])])


def quality(ratings: pd.DataFrame, menu: pd.DataFrame) -> dict[str, np.ndarray]:
    slugs = menu["item_slug"].tolist()
    f = flags(menu)
    out = {"ALL": 0.7 * minmax(bayesian_average(ratings, slugs)) + 0.3 * f}
    for d in DAYPARTS:
        part = ratings[ratings["daypart"] == d]
        out[d] = 0.7 * minmax(bayesian_average(part, slugs)) + 0.3 * f
    return out


# ---------------------------------------------------------------- §4.5 hybrid + MMR

def normalise_weights(w: dict[str, int]) -> dict[str, float]:
    comp = [w["compCoocPm"], w["compQualityPm"], w["compContentPm"]]
    sim = [w["simContentPm"], w["simTastePm"], w["simQualityPm"]]
    cs, ss = sum(comp), sum(sim)
    return {
        "compCooc": comp[0] / cs, "compQuality": comp[1] / cs, "compContent": comp[2] / cs,
        "simContent": sim[0] / ss, "simTaste": sim[1] / ss, "simQuality": sim[2] / ss,
    }


@dataclass
class Model:
    slugs: list[str]
    menu: pd.DataFrame
    content: np.ndarray
    taste: np.ndarray
    taste_raw: np.ndarray
    cooc: np.ndarray
    quality: dict[str, np.ndarray]
    weights: dict[str, float]
    lists: dict[str, dict[str, list[dict]]] = field(default_factory=dict)


def _mmr(source: int, candidates: list[int], score: dict[int, float], content: np.ndarray,
         categories: list[str], max_per_category: int, slugs: list[str]) -> list[int]:
    """Greedy MMR: λ·score − (1−λ)·max content similarity to the already chosen; ties by slug."""
    chosen: list[int] = []
    per_cat: dict[str, int] = {}
    pool = sorted(candidates, key=lambda j: slugs[j])
    while pool and len(chosen) < TOP_N:
        best, best_val = None, -math.inf
        for j in pool:
            if per_cat.get(categories[j], 0) >= max_per_category:
                continue
            redundancy = max((content[j, s] for s in chosen), default=0.0)
            val = MMR_LAMBDA * score[j] - (1 - MMR_LAMBDA) * redundancy
            if val > best_val + 1e-12:
                best, best_val = j, val
        if best is None:
            break
        chosen.append(best)
        per_cat[categories[best]] = per_cat.get(categories[best], 0) + 1
        pool.remove(best)
    return chosen


def build_lists(model: Model) -> dict[str, dict[str, list[dict]]]:
    w, slugs, menu = model.weights, model.slugs, model.menu
    roles = menu["meal_role"].tolist()
    cats = menu["category"].tolist()
    q = model.quality["ALL"]
    out: dict[str, dict[str, list[dict]]] = {}
    for i, slug in enumerate(slugs):
        others = [j for j in range(len(slugs)) if j != i]
        comp_c = [j for j in others if roles[j] != roles[i]]
        sim_c = [j for j in others if roles[j] == roles[i]]
        comp_score = {j: w["compCooc"] * model.cooc[i, j] + w["compQuality"] * q[j]
                      + w["compContent"] * model.content[i, j] for j in comp_c}
        sim_score = {j: w["simContent"] * model.content[i, j] + w["simTaste"] * model.taste[i, j]
                     + w["simQuality"] * q[j] for j in sim_c}
        entry = {}
        for kind, cand, score in (("COMPLEMENT", comp_c, comp_score), ("SIMILAR", sim_c, sim_score)):
            order = _mmr(i, cand, score, model.content, cats, MAX_PER_CATEGORY[kind], slugs)
            entry[kind] = [{
                "slug": slugs[j],
                "rank": r + 1,
                "score": float(score[j]),
                "content": float(model.content[i, j]),
                "taste": float(model.taste[i, j]),
                "cooc": float(model.cooc[i, j]),
                "quality": float(q[j]),
            } for r, j in enumerate(order)]
        out[slug] = entry
    return out


def train(menu: pd.DataFrame, ratings: pd.DataFrame, weights_pm: dict[str, int] | None = None,
          stopwords: list[str] | None = None) -> Model:
    menu = menu.sort_values("item_slug").reset_index(drop=True)
    slugs = menu["item_slug"].tolist()
    content = content_similarity(content_vectors(menu, stopwords))
    mat, _ = rating_matrix(ratings, slugs)
    base = baseline(mat)
    raw = taste_raw(residuals(mat, base))
    taste = taste_similarity(raw)
    cooc = per_source_normalise(cooccurrence(ratings, slugs).confidence)
    model = Model(slugs, menu, content, taste, raw, cooc, quality(ratings, menu),
                  normalise_weights(weights_pm or DEFAULT_WEIGHTS))
    model.lists = build_lists(model)
    return model


def with_weights(model: Model, weights_pm: dict[str, int]) -> Model:
    """Same fitted components, lists re-ranked with other weights (for the weight search)."""
    m = Model(model.slugs, model.menu, model.content, model.taste, model.taste_raw, model.cooc,
              model.quality, normalise_weights(weights_pm))
    m.lists = build_lists(m)
    return m


# ---------------------------------------------------------------- §9 evaluation

def top(model: Model, slug: str, kind: str, k: int = 5) -> list[str]:
    return [e["slug"] for e in model.lists[slug][kind][:k]]


def eval_complement(recommend, test: pd.DataFrame, k: int = 5) -> dict[str, float]:
    """recommend(slug) → ranked slugs. Queries: each enjoyed dish of a held-out visit with ≥2 enjoyed."""
    hits, precision, recall, queries = 0, 0.0, 0.0, 0
    for _, g in test[test["rating"] >= COOC_MIN_RATING].groupby("visit_id", sort=True):
        items = sorted(set(g["item_slug"]))
        if len(items) < 2:
            continue
        for x in items:
            rest = set(items) - {x}
            rec = recommend(x)[:k]
            got = len(rest & set(rec))
            queries += 1
            hits += got > 0
            precision += got / k
            recall += got / len(rest)
    q = max(queries, 1)
    return {"queries": queries, "hit_rate": hits / q, "precision": precision / q, "recall": recall / q}


def eval_similar(recommend, train_df: pd.DataFrame, test: pd.DataFrame, roles: dict[str, str],
                 k: int = 5) -> dict[str, float]:
    """Pairs (query liked in train, target liked in test, same user, same meal role)."""
    liked_train = train_df[train_df["rating"] >= 4].groupby("user_id")["item_slug"].apply(set)
    hits, pairs = 0, 0
    for u, target in test[test["rating"] >= 4][["user_id", "item_slug"]].itertuples(index=False):
        for qslug in sorted(liked_train.get(u, set())):
            if roles[qslug] != roles[target] or qslug == target:
                continue
            pairs += 1
            hits += target in recommend(qslug)[:k]
    return {"pairs": pairs, "hit_rate": hits / max(pairs, 1)}


def rmse_mae(model: Model, train_df: pd.DataFrame, test: pd.DataFrame) -> dict[str, float]:
    """Rating prediction on held-out ratings: CF against simple baselines (§9)."""
    mat, users = rating_matrix(train_df, model.slugs)
    base = baseline(mat)
    res = residuals(mat, base)
    ui = {u: k for k, u in enumerate(users)}
    ii = {s: k for k, s in enumerate(model.slugs)}
    mu = base.mu
    item_mean = train_df.groupby("item_slug")["rating"].mean()
    user_mean = train_df.groupby("user_id")["rating"].mean()
    err = {"global_mean": [], "item_mean": [], "user_mean": [], "baseline": [], "item_cf": []}
    for u, s, r in test[["user_id", "item_slug", "rating"]].itertuples(index=False):
        uidx, j = ui.get(u, -1), ii[s]
        err["global_mean"].append(mu - r)
        err["item_mean"].append(float(item_mean.get(s, mu)) - r)
        err["user_mean"].append(float(user_mean.get(u, mu)) - r)
        err["baseline"].append(min(5.0, max(1.0, base.predict(uidx, j))) - r)
        err["item_cf"].append(predict_rating(model.taste_raw, res, base, uidx, j) - r)
    out = {"ratings": len(test)}
    for name, e in err.items():
        a = np.array(e)
        out[f"rmse_{name}"] = float(np.sqrt((a * a).mean()))
        out[f"mae_{name}"] = float(np.abs(a).mean())
    return out


def coverage(model: Model, k: int = 5) -> float:
    seen = {e for s in model.slugs for kind in ("COMPLEMENT", "SIMILAR") for e in top(model, s, kind, k)}
    return len(seen) / len(model.slugs)


# ---------------------------------------------------------------- export (parity file for R3)

def export_reference(model: Model, path: Path | None = None, weights_pm: dict[str, int] | None = None) -> Path:
    path = path or DATA / "reference_scores.json"
    doc = {
        "description": "Reference recommendation lists from notebooks/reco_lib.py (DEMO data). "
                       "The TypeScript engine must reproduce these (TC-UNIT-140).",
        "seed": SEED,
        "weights_pm": weights_pm or DEFAULT_WEIGHTS,
        "items": {s: model.lists[s] for s in model.slugs},
        "quality": {s: {w: float(model.quality[w][k]) for w in WINDOWS} for k, s in enumerate(model.slugs)},
    }
    path.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return path
