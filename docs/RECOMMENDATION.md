# RECOMMENDATION — Food recommendation system (design and data spec)

**Status:** Phase R0 design, 2026-10-30. Requested by the project guide (mentor) after Phase 8. Phases R1–R5 implement it (PROGRESS.md).
**Data decision (team, 2026-10-30):** the website has **no orders or billing**, so the recommender learns from a **demo feedback (ratings) dataset**. It uses the format of the team's `feedback.csv` plus a `visit_id`, and is generated for all 65 real dishes (§3, ADR-071).
**Related:** PRD §5.3 (FR-060…069, NFR-013…014), TRD §14, ADR-068…071, SECURITY AB-17…21 / R-14…16, TEST_PLAN §4.9, UI_SPEC §7.3, §12.3, §12.12 and §13.

---

## 1. Goal and constraints

Suggest dishes a guest is likely to enjoy, in two places:
1. **Item page:** "Goes well with" (dishes that complete a meal) and "You may also like" (dishes with a similar taste).
2. **Help me choose:** a guest answers three quick questions (mood, budget, flavours) and gets 5 suggestions with reasons.

| Constraint (CLAUDE.md) | Consequence |
|---|---|
| No ordering, billing, cart or customer accounts (§3.0) | There is no purchase or real rating history. We train on a **synthetic demo feedback dataset** (§3) and keep the data source swappable (§7). |
| Never fabricate ratings, reviews or sales statistics (§3.1 E, §6.2, ADR-026) | Demo ratings and comments are **never shown**, never stored in the real `Feedback` table, and never quoted. Public reasons only state real menu facts (§6). |
| Server-side logic, minimal client JavaScript (§15) | Scores are computed **offline** (training) and stored; a page view is one indexed read. |
| No unnecessary services (rule 13) | The app engine is TypeScript inside Next.js. The **Python notebook** is the analysis and reference implementation for the report; the app is tested against it (§8). |
| Freshness ≤30 s (§3.1 J) | Availability and archive filters are applied **at read time**. |
| Pure-veg outlet | Items get **flavour tags** instead of a veg/non-veg question (§2). |

## 2. Item features

### 2.1 Flavour tags (new, admin-editable)
`MenuItem.flavorTags FlavorTag[]` (Postgres enum array, like `Feedback.tags`, ADR-062). Fixed list:

| Tag | Label | Examples from the real menu |
|---|---|---|
| `SPICY` | Spicy | Hot To Hell Pizza, Hot Passion Spicy Maggi, Spicy Salsa Barbeque Burger |
| `CHEESY` | Cheesy | Cheese Loaded Kulhad Pizza, Cheese Volcano Kulhad Momos, Korean Cheesy Fries |
| `KOREAN` | Korean | Korean Burger, Korean Pizza, Korean Mojito, Korean Jalapeno Bun |
| `PERI_PERI` | Peri Peri | Peri Peri French Fries, Peri Peri Pasta, Peri Peri Cheese Blast |
| `ITALIAN` | Italian | Margherita, Pizza Di Sicilia, Alfredo (White Sauce), Italian Treat |
| `MEXICAN` | Mexican | Mexican King Burger, Mexican Salsa Wrap, Nachos with Cheese Dip |
| `SMOKY` | Barbeque | Spicy Salsa Barbeque Burger, Paneer Barbeque Pizza |
| `PANEER` | Paneer | Royal Paneer Grilled Burger, Paneer Barbeque Pizza, Korean Spicy Paneer |
| `CREAMY` | Creamy | Alfredo (White Sauce), Ala Rosey (Pink Sauce), shakes |
| `FRUITY` | Fruity | Strawberry Mojito, Tangy Mango Mojito, Peach Ice Tea |
| `CHOCOLATE` | Chocolate | Oreo Chocolate Shake, KitKat Chocolate Shake, Hot Chocolate |
| `COFFEE` | Coffee | Premium Cold Coffee, Strong Cold Coffee, Hot Coffee |
| `MINTY` | Minty | Mint Mojito |

- Each item has at most 5 tags. Initial values come from a deterministic keyword rule over the real names and descriptions (R1), written by a create-only script and **reviewed by the team** (Q-22).
- Tags describe the dish, like a menu legend; they are not health or dietary claims.

### 2.2 Meal role (new, per category, admin-editable)
`MenuCategory.mealRole MealRole` = `MAIN | SIDE | DRINK | DESSERT`.

| Role | Categories |
|---|---|
| MAIN | Burgers, Pizza, Pasta, Wraps, Toastie, Special Buns, Maggi |
| SIDE | Fries, Garlic Bread, Nachos, Momos |
| DRINK | Mojito, Cold Coffee, Milk Shakes, Ice Tea, Hot Beverages |
| DESSERT | (none yet; ice-cream scoops were left out of the menu import, ADR-044) |

New admin-created categories default to `MAIN`; the category form shows the field.

### 2.3 Existing features used
Category, `pricePaise`, `dietType`, `isBestSeller`, `isTrending`, `isFeatured`, and the name + description text.

## 3. Demo feedback dataset (data generation spec)

### 3.0 Cross-check of the team's `feedback.csv` (2026-10-30)
The team supplied a 2,386-row ratings file. It was checked against the real menu (`prisma/data/sangli-menu.ts`, 65 items):

| Check | Result |
|---|---|
| Structure | Clean: unique, sequential `feedback_id`; each `item_id` always has the same name; 400 users with 2–12 ratings each; no repeated user–dish pair; Aug 1 → Oct 29, 11:00–21:59 |
| Rating ↔ sentiment | Consistent (4–5 positive, 3 neutral, 1–2 negative); distribution 1: 3 %, 2: 15 %, 3: 34 %, 4: 34 %, 5: 13 % |
| Dish names | **11 of 36 exact matches**; about 11 near-matches (Margherita Pizza → Margherita, Salted Fries → Salted French Fries, White Sauce Pasta → Alfredo (White Sauce), …); **about 14 dishes not on the Sangli menu** (Classic Aloo Tikki Burger, Paneer Zinger Burger, Farmhouse Pizza, Paneer Momos, Veg Club Toastie, Cheese Maggi, …) |
| Coverage | **29 real dishes have no ratings** (all Korean items, 8 of 9 mojitos, most ice teas and shakes, Hot Coffee, Special Tea, …) |
| Content | 39 comment templates; 58 cold drinks described as "fresh and hot"; claims such as "Best X in Sangli" |
| Pairing | One dish per row: shows taste, not which dishes are eaten together |

**Decision:** the file is kept as a **reference** (`data/reco/reference/feedback_team_v1.csv`, R1) for its format and rating distribution. The training data is **generated fresh** in the same format for the real menu (ADR-071).

### 3.1 Principles
- **Real dishes only.** The generator reads published, non-archived items from the database (availability is ignored: "sold out" is temporary and is filtered when suggestions are shown, §4.7), so every row uses the exact names and IDs on the website.
- **Same format as the team's file, plus two columns:** `visit_id` (dishes eaten on the same visit) and `item_slug` (stable join key).
- **Deterministic.** Seeded PRNG (mulberry32, seed `2026`), fixed window **2026-08-01 → 2026-10-29, 11:00–21:59 IST** (the same span as the team's file; this is **not** a claim about opening hours, Q-05), generator version `1`. Same menu + same seed → byte-identical CSV.
- **Clearly demo.** Separate tables (`DemoVisit`, `DemoRating`), `isDemo = true`, `dataSource = DEMO_FEEDBACK` on every model run. Never written to the real `Feedback` table, never returned by a public API or page. Demo "users" are numbers 1–400 with no personal data.
- **Volume.** 400 demo users, about 1,400 visits, about 2,400 ratings (in line with the team's file; R1 measured 1,384 visits and 2,392 ratings on the dev menu).
- **Guarded.** On production the script refuses to run without `--production`, and never deletes demo rows unless `--replace` is given (then it replaces only the demo tables, in one transaction).

### 3.2 Output format (`data/reco/demo_feedback.csv`)
`feedback_id, user_id, visit_id, item_id, item_slug, item_name, rating, comment, sentiment, timestamp` — for example:
`17,142,503,12,korean-burger,Korean Burger,5,"Loved the Korean Burger, ekdum mast!",positive,2026-08-04 19:12:00`

### 3.3 Demo users (taste profiles)
Each of the 400 users is given, at random:
- 1–3 **liked flavour tags** (weighted: Cheesy 20 %, Peri Peri 14 %, Korean 12 %, Spicy 12 %, Coffee 10 %, Chocolate 10 %, Fruity 8 %, Italian 6 %, Mexican 4 %, Paneer 4 %);
- 0–1 **disliked tag** (Spicy 40 %, Coffee 20 %, Minty 20 %, Creamy 20 %; never one of the liked tags);
- a **budget band** (student < ₹150 per person 50 %, regular ₹150–₹300 35 %, treat > ₹300 15 %);
- a **visit count** of 1–6 (weights 8/20/25/20/15/12 %), capped at 12 ratings and topped up to at least 2, so each user has 2–12 ratings like the team's file.

### 3.4 Visits and meal patterns
Each visit picks a daypart (11–14 → 35 %, 14–17 → 30 %, 17–22 → 35 %) and a meal pattern, then fills the pattern's slots with the dishes eaten together (`a|b` = one of the categories; `%` = chance the slot is filled):

| # | Pattern | Slots | 11–14 | 14–17 | 17–22 |
|---|---|---|---|---|---|
| P1 | Burger meal | Burgers · Fries 70 % · Mojito\|Cold Coffee\|Ice Tea 80 % | 14 | 12 | 16 |
| P2 | Pizza share | Pizza · Garlic Bread 60 % · Mojito\|Cold Coffee 70 % | 10 | 8 | 16 |
| P3 | Pasta plate | Pasta · Garlic Bread 50 % · Mojito\|Ice Tea 60 % | 9 | 7 | 9 |
| P4 | Momo snack | Momos · Ice Tea\|Mojito 70 % | 8 | 11 | 8 |
| P5 | Quick bite | Wraps\|Toastie\|Special Buns · Fries 40 % · Cold Coffee 50 % | 12 | 10 | 6 |
| P6 | Maggi and chai | Maggi · Hot Beverages 75 % | 12 | 10 | 5 |
| P7 | Coffee break | Hot Beverages\|Cold Coffee · Toastie\|Garlic Bread\|Special Buns 60 % | 12 | 12 | 5 |
| P8 | Shake treat | Milk Shakes · Fries\|Nachos 50 % | 5 | 9 | 10 |
| P9 | Nachos and drinks | Nachos · Fries 60 % · Mojito | 3 | 6 | 9 |
| P10 | Just a drink | Mojito\|Ice Tea\|Cold Coffee\|Milk Shakes | 12 | 13 | 8 |
| P11 | Korean craving | KOREAN main · Korean Cheesy Fries 70 % · Korean Mojito 70 % | 3 | 2 | 8 |

**Dish choice inside a category:** weight `w = (1 + 1.5·isBestSeller + 0.8·isTrending) × (3 if the dish has a liked tag) × (0.2 if it has the disliked tag) × themeBoost`. `themeBoost` = 2 when the dish shares a tag with the visit's first dish (Peri Peri pasta → Peri Peri fries). The visit total must fit the user's budget (+10 %); otherwise the slot is redrawn up to 5 times, then the last optional slot is dropped. A user never rates the same dish twice (a repeat is redrawn), matching the team's file. **Noise:** 10 % of visits add one random dish; 5 % swap one dish for a random one. Both stay within the budget; only a visit's first dish may exceed it, when nothing in that category fits (then the cheapest is taken).

### 3.5 Rating model
`score = 3.1 + q(dish) + 0.9·liked − 1.2·disliked + 0.3·sameThemeAsVisit + ε`, then stars by fixed cut-points (an ordinal model): `< 1.5` → 1★, `< 2.5` → 2★, `< 3.42` → 3★, `< 4.52` → 4★, else 5★
- `q(dish)`: a hidden per-dish quality offset, seeded normal(0, 0.35), +0.25 for best sellers;
- `liked` / `disliked`: 1 if the dish has one of the user's liked / disliked tags;
- `ε`: normal(0, 0.78).

Plain rounding always produced too many 3★, so R1 calibrated the base, noise and cut-points. The result on the real menu file is 1★ 2.7 % · 2★ 15.0 % · 3★ 34.5 % · 4★ 34.4 % · 5★ 13.4 %, against the team's 3 · 15 · 34 · 34 · 13 % (TC-UNIT-132 keeps it within ±3 points). `sentiment` follows the rating exactly like the team's file: 4–5 positive, 3 neutral, 1–2 negative.

### 3.6 Comments
- About 80 templates per sentiment, chosen by meal role and temperature ("chilled and refreshing" only for cold drinks, "hot and fresh" only for hot food and hot beverages), plus an optional add-on ("Great value for money", "A bit overpriced"). Some Hinglish is kept ("ekdum mast").
- **Never used:** place superlatives ("Best X in Sangli"), named people, staff claims, hygiene or certification claims.
- Comments exist only for the notebook's optional sentiment model; they are never displayed.

### 3.7 Exports
`npm run reco:export` writes `data/reco/menu_items.csv` (slug, name, category, mealRole, price, flags, tags, description) and `data/reco/demo_feedback.csv` (§3.2). Both are committed for the notebook; they contain only public menu data and demo ratings.

## 4. Algorithms

All scores are in `[0, 1]`. Notation: dishes `i`, `j`; demo users `u`; visits `v`.

### 4.1 Content similarity `C(i, j)`
Cosine similarity of an item vector made of weighted blocks, each L2-normalised before weighting:

| Block | Encoding | Weight |
|---|---|---|
| Category | one-hot | 1.0 |
| Meal role | one-hot | 0.5 |
| Flavour tags | multi-hot | 1.5 |
| Price | one-hot band (< ₹100, ₹100–200, > ₹200) | 0.5 |
| Text | TF-IDF of name + description | 1.0 |

TF-IDF follows scikit-learn's defaults so the TypeScript port matches the notebook: tokens = lowercase `[a-z0-9]{2,}`, a fixed committed English stop-word list, `idf = ln((1 + n) / (1 + df)) + 1`, L2 row normalisation.

### 4.2 Taste similarity `T(i, j)` (item-based collaborative filtering on ratings)
*Revised in R2 (ADR-073): residuals of a baseline predictor instead of plain user-mean centring.*
- **Baseline predictor** `b_ui = μ + b_u + b_i`, damped towards 0 for users and dishes with few ratings:
  - `b_i = Σ(r − μ) / (10 + n_i)`;
  - `b_u = Σ(r − μ − b_i) / (15 + n_u)`.
- **Residuals:** `e(u, i) = r(u, i) − b_ui`.
- **Taste similarity:** the cosine of the residuals over users who rated both dishes, shrunk for small overlaps: `T = cos(i, j) · n_ij / (n_ij + 10)`.
  - Pairs with fewer than 3 common raters, or a negative value, become 0.
  - The rest is divided by the maximum for source `i`.
- **Rating prediction** (§9 only): `pred(u, j) = b_uj + Σ s·e / (Σ s + 2)` over the user's 20 most similar rated dishes with `s > 0`, clipped to 1–5.

### 4.3 Visit co-occurrence `K(i → j)` (what is eaten together)
- From visits where **both** dishes were rated ≥ 3 (eaten together and enjoyed):
  - `n_i` = such visits containing `i`, `n_ij` = containing both, `V` = all such visits;
  - `confidence = n_ij / (n_i + α)` with shrinkage `α = 5`;
  - `lift = (n_ij · V) / (n_i · n_j)`.
- Pairs with `n_ij < 3` or `lift ≤ 1` are dropped; `K` is divided by the maximum confidence for source `i`.
- The notebook reports support, confidence and lift as association rules.

### 4.4 Quality `P(j)`
A **Bayesian average rating** `B(j) = (m · μ + Σ r) / (m + n_j)` with `m = 10` and `μ` = the global mean. Then `P(j) = 0.7 · minmax(B) + 0.3 · flag(j)`, where `flag` = 1 for best seller, 0.6 for trending, else 0. `P_d(j)` uses only ratings from daypart `d`.

### 4.5 Hybrid lists (stored per active model run)

| List | Candidates | Score (default weights) |
|---|---|---|
| **COMPLEMENT** ("Goes well with") | `mealRole(j) ≠ mealRole(i)` | `0.60·K + 0.25·P + 0.15·C` (R0 default; R2 chose `0.6·K + 0.3·P + 0.1·C`) |
| **SIMILAR** ("You may also like") | `mealRole(j) = mealRole(i)`, `j ≠ i` | `0.50·C + 0.30·T + 0.20·P` (R0 default; R2 chose `0.6·C + 0.1·T + 0.3·P`) |

- **Weights (R2, ADR-073)** were chosen by grid search on the validation split. The rule is the highest HitRate@5 among weights with **catalogue coverage@5 ≥ 60 %**, which avoids a popularity-only list; ties go to the closest to the defaults.
  - **COMPLEMENT** `0.6·K + 0.3·P + 0.1·C`.
  - **SIMILAR** `0.6·C + 0.1·T + 0.3·P`.
  - Stored as integer per-mille (600/300/100 and 600/100/300) and renormalised to sum to 1. These become the `RecoSettings` defaults in R3.
- **Diversity (MMR re-ranking):** each next pick maximises `0.7·score − 0.3·max C(candidate, already picked)`, with at most **2** dishes per category in SIMILAR and **3** in COMPLEMENT. Ties are broken by slug.
- Top **10** per dish and list are stored, so read-time filtering still leaves at least 4.
- The stored `score` is the hybrid score (not the MMR value); `rank` is the MMR order.

### 4.6 Help me choose
Inputs are fixed choices, validated on the server:
- `mood`: `meal` (MAIN), `snack` (SIDE), `drink` (DRINK), `sweet` (CHOCOLATE/FRUITY/CREAMY tags or DESSERT);
- `budget`: `under-100`, `100-200`, `200-plus`, `any`;
- `tags`: 0–3 flavour tags.

The daypart comes from the server clock in IST.
- **Score:** `0.45 · Jaccard(tags, tags_j) + 0.35 · P_d(j) + 0.20 · flag(j)`. Without tags, the tag term is dropped and the rest renormalised.
- **Diversity:** max 2 per category.
- **Result:** 5 dishes; for `meal`, each main also gets one **pairing** (its top COMPLEMENT that keeps the pair total inside the budget band).

The answers act as a temporary taste profile, so the guest gets personalised suggestions without an account or tracking.

### 4.7 Read-time rules (item page and suggestions)
1. Only published, non-archived, **available** items of non-archived categories. Sold-out items still appear on the menu (FR-009) but are never suggested.
2. **Admin-curated links first:** `ItemRelation` FREQUENTLY_BOUGHT_TOGETHER → "Goes well with"; RELATED → "You may also like" (FR-012 keeps working).
3. Then the active run's list, skipping duplicates; show **4** per section.
4. **Fallback chain** if fewer than 4: same-role best sellers → same-category items by `sortOrder`. A section with zero items is hidden.
5. If `RecoSettings.enabled = false`, only admin-curated links are shown (exactly today's behaviour).

## 5. Training pipeline and model runs

```
reco:train / admin "Retrain" / automatically after a menu change
  → take lock (RecoSettings.trainingLockUntil, conditional update; no raw SQL)
  → load live menu + ratings of the data source (DEMO_FEEDBACK)
  → deterministic 80/20 split (ratings by user, visits by visit; seed 2026)
  → fit on 80 % → evaluate on 20 % (RMSE, MAE, HitRate@5, Precision@5, Recall@5, coverage)
  → quality gate: HitRate@5 (COMPLEMENT and SIMILAR) ≥ active run − 0.02
                  (first run: must beat the popularity-only baseline)
       pass → refit on 100 % → write RecoModelRun + ItemRecommendation + ItemPopularity
              in one transaction → activate (RecoSettings.activeRunId) → expire tag `reco`
       fail → RecoModelRun status REJECTED with the reason; the active run is unchanged
  → release lock; if another change arrived meanwhile (retrainPending), run once more
```

- **Versioning and rollback.** Each run stores its weights, data source, rating/visit/item counts, metrics, duration and who started it. The admin can re-activate any earlier ACTIVE/ARCHIVED run (one update + audit + cache expiry). Runs older than the latest 10 are pruned.
- **Auto-retrain** follows item create, archive, unarchive, publish/unpublish, category change, flavour-tag change and meal-role change. It runs after the response (`after()`). Availability and price changes do **not** retrain; read-time filtering covers them.
- **Timing budget:** 100 items × 5,000 ratings must train in < 5 s on Vercel (measured in R3).
- **New dishes:** a dish added after the dataset was generated has no ratings. It still gets content-based SIMILAR lists, and role/quality-based COMPLEMENT lists, at the next (automatic) retrain.

## 6. Honest wording (public)

| Code | Example text | Source |
|---|---|---|
| `PAIRS_WITH_ROLE` | "A drink to go with it" / "A side for your main" | meal roles |
| `SHARED_TAGS` | "Also Korean & cheesy" | flavour tags |
| `SAME_CATEGORY` | "Another pizza" | category |
| `IN_BUDGET` | "Under ₹100" | price |
| `BEST_SELLER` / `TRENDING` | "Best seller" | admin flags (already shown as badges) |
| `ADMIN_PICK` | "Café pick" | `ItemRelation` |

- **Never used:** star ratings, average ratings, counts, percentages, "guests rated", "people who liked … also liked", "frequently bought together" for algorithmic results, or any demo comment text.
- The sections carry the caption "Suggestions are generated automatically from our menu."
- The admin page states that the model is trained on **demonstration feedback**.

## 7. Real data later
- The trainer reads ratings only through `src/server/reco/sources.ts` (`DemoFeedbackSource` now). `RecoModelRun.dataSource` records which source was used. Two future sources:
  - **Real item feedback:** the public feedback form could gain an optional "Which dish?" + rating field. Only APPROVED feedback would ever be used. This is a product change for the team to decide and needs a privacy note (Q-25).
  - **Billing (POS) data:** anonymous bill lines, if the café ever shares them.
- Both are out of scope for this release.

## 8. Python notebook (report) and parity with the app
- `notebooks/recommendation.ipynb` + `notebooks/requirements.txt` (pandas, numpy, scikit-learn, matplotlib, jupyter; pinned). It reads `data/reco/*.csv`.
- **Sections:**
  - data overview (rating distribution next to the team's reference file, ratings per dish/user, sparsity, daypart heatmap);
  - the content model;
  - rating-based item–item CF, compared with **matrix factorisation (TruncatedSVD)** in the notebook only;
  - visit association rules;
  - Bayesian quality;
  - the hybrid, with a weight grid search;
  - evaluation tables and charts;
  - *optional:* a comment **sentiment classifier** (TF-IDF + logistic regression). The report notes that templated comments make it easy;
  - export.
- **Exports** `data/reco/reference_scores.json`: the top-10 COMPLEMENT and SIMILAR lists for every dish with the chosen weights. The TypeScript tests require identical order and scores within `1e-6` (TC-UNIT-140).

## 9. Evaluation protocol
**Split (R2):**
- **Test:** a visit is held out when `FNV-1a("2026:test:<visit_id>") mod 5 == 0` (20 %; all ratings of that visit are test ratings).
- **Validation:** an independent second split with salt `valid` inside the rest, used for every tuning choice.

There is no library randomness, so Python and TypeScript split identically.
- **Rating prediction:** RMSE and MAE of item-based CF against the global mean, dish mean, user mean and baseline predictor (and SVD in the notebook).
- **SIMILAR (taste):** pairs (query = a dish the user rated ≥ 4 in training, target = a dish the same user rated ≥ 4 in a test visit, same meal role). HitRate@5 = share of pairs where the target is in the query's SIMILAR top 5.
- **COMPLEMENT (pairing):** for each held-out visit with ≥ 2 dishes rated ≥ 3, each such dish in turn is the query and the rest of those dishes `R` is the target:
  - HitRate@5 = share of queries whose COMPLEMENT top 5 contains at least one dish of `R`;
  - Precision@5 = `|top5 ∩ R| / 5`;
  - Recall@5 = `|top5 ∩ R| / |R|`.
- **Coverage** = distinct dishes recommended anywhere / catalogue size.
- **Baselines:** random (seeded), popularity-only, content-only, CF-only / co-occurrence-only.
- Numbers are reported as measured. The report states that the metrics show how well the methods recover the generator's patterns, not real customer taste (Q-23).

## 9a. Results (R2 notebook, demo data, test split)
| | Random | Popularity | Content | Co-occurrence / CF alone | **Hybrid** |
|---|---|---|---|---|---|
| "Goes well with" HitRate@5 | 0.143 | 0.245 | 0.185 | 0.460 | **0.457** |
| "You may also like" HitRate@5 | 0.238 | 0.376 | 0.365 | 0.337 | **0.403** |

- **Rating prediction (RMSE):** global mean 0.959 · dish mean 0.897 · user mean 1.119 · **baseline 0.902** · item CF 0.909 · SVD (k = 10) 0.902. CF adds nothing over the baseline at about 6 ratings per user (sparsity).
- **Coverage@5:** 95.4 %.
- **Full tables:** `data/reco/evaluation.json` and `notebooks/recommendation.ipynb`.

## 10. Admin
`/admin/recommendations` (allowlisted admins only; every action audited):
- **Overview:** on/off switch, active run (version, trained at, data source "Demo feedback", RMSE, HitRate@5), "Retrain now", weights form (validated per-mille, preview of normalised values).
- **Runs:** history table (version, status, metrics, gate result, started by), "Activate" on earlier runs with a confirm dialog.
- **Inspect:** pick a dish → its COMPLEMENT and SIMILAR lists with score components and reason codes, plus a preview of what the public page shows after filtering.
- Item editor: flavour-tag chips. Category editor: meal role.
