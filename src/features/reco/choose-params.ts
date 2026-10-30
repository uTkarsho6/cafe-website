import {
  BUDGET_KEYS,
  FLAVOR_TAG_KEYS,
  MAX_CHOOSE_TAGS,
  MOOD_KEYS,
  type BudgetKey,
  type FlavorTagKey,
  type MoodKey,
} from '@/lib/validation/reco'

/**
 * URL state of /help-me-choose (UI_SPEC §12.12). The form is a plain GET form, so answers live in
 * the URL (shareable, back button works, works without JavaScript):
 *   /help-me-choose?mood=meal&budget=100-200&tags=SPICY&tags=CHEESY
 * Like the menu page, unknown values are ignored rather than shown as errors. The one exception is
 * more than 3 flavours: that is refused with a message (the API answers 400 for the same input).
 */
export type ChooseParams = {
  mood: MoodKey | null
  budget: BudgetKey
  tags: FlavorTagKey[]
  tooManyTags: boolean
}

type Raw = Record<string, string | string[] | undefined>

const all = (v: string | string[] | undefined) => (v === undefined ? [] : [v].flat())
const first = (v: string | string[] | undefined) => all(v)[0]

export function parseChooseParams(raw: Raw): ChooseParams {
  const mood = first(raw.mood)
  const budget = first(raw.budget)
  // Accept repeated `tags=` (the form) and comma lists (the API style); the count is bounded first.
  const given = all(raw.tags)
    .slice(0, 20)
    .flatMap((t) => t.split(','))
    .map((t) => t.trim())
  const tags = FLAVOR_TAG_KEYS.filter((k) => given.includes(k))
  return {
    mood: MOOD_KEYS.find((m) => m === mood) ?? null,
    budget: BUDGET_KEYS.find((b) => b === budget) ?? 'any',
    tags: tags.slice(0, MAX_CHOOSE_TAGS),
    tooManyTags: tags.length > MAX_CHOOSE_TAGS,
  }
}

export function chooseHref(p: {
  mood?: MoodKey | null
  budget?: BudgetKey
  tags?: FlavorTagKey[]
}) {
  const q = new URLSearchParams()
  if (p.mood) q.set('mood', p.mood)
  if (p.budget && p.budget !== 'any') q.set('budget', p.budget)
  for (const t of p.tags ?? []) q.append('tags', t)
  const s = q.toString()
  return s ? `/help-me-choose?${s}` : '/help-me-choose'
}
