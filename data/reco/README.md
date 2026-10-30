# data/reco — recommendation data (DEMO)

Everything here is **demonstration data** for the food recommender (docs/RECOMMENDATION.md). It is never shown on the website and never stored in the real `Feedback` table.

| File | What it is | Made by |
|---|---|---|
| `menu_items.csv` | The 65 real dishes: id, slug, name, category, meal role, price (₹), best seller / trending flags, flavour tags (`|`-separated), description | `npm run reco:export` |
| `demo_feedback.csv` | Generated demo ratings in the team's format plus `visit_id` and `item_slug`: `feedback_id, user_id, visit_id, item_id, item_slug, item_name, rating, comment, sentiment, timestamp` (IST) | `npm run reco:generate` then `npm run reco:export` |
| `reference/feedback_team_v1.csv` | The team's original `feedback.csv` (2,386 rows), kept **as a reference only**: its format and star mix. Only 11 of its 36 dish names match the Sangli menu (RECOMMENDATION §3.0) | supplied by the team, 2026-10-30 |

**Regenerate** (development database):
```bash
npm run reco:tags                    # first time only: initial flavour tags + meal roles (create-only)
npm run reco:generate -- --replace   # same menu + seed 2026 → same rows
npm run reco:export
```

Demo "users" are plain numbers (1–400) with no personal data. Comments are templated text for the notebook's optional sentiment model.
