import {
  FLAVOR_TAG_KEYS,
  MAX_FLAVOR_TAGS,
  type FlavorTagKey,
  type MealRoleKey,
} from '../validation/reco'

/**
 * Initial flavour tags and meal roles for the real menu (RECOMMENDATION §2, ADR-069).
 * A deterministic keyword rule; the team reviews the result in the admin (Q-22). Pure, so it is
 * unit-tested against the real menu file (TC-UNIT-133).
 */

/** Meal role per real category slug; unknown (admin-created) categories default to MAIN. */
export const CATEGORY_MEAL_ROLES: Record<string, MealRoleKey> = {
  burgers: 'MAIN',
  pizza: 'MAIN',
  pasta: 'MAIN',
  wraps: 'MAIN',
  toastie: 'MAIN',
  'special-buns': 'MAIN',
  maggi: 'MAIN',
  fries: 'SIDE',
  'garlic-bread': 'SIDE',
  nachos: 'SIDE',
  momos: 'SIDE',
  mojito: 'DRINK',
  'cold-coffee': 'DRINK',
  'milk-shakes': 'DRINK',
  'ice-tea': 'DRINK',
  'hot-beverages': 'DRINK',
}

export function mealRoleForCategory(slug: string): MealRoleKey {
  return CATEGORY_MEAL_ROLES[slug] ?? 'MAIN'
}

type Rule = { tag: FlavorTagKey; test: (name: string, text: string) => boolean }

// `text` = name + description, lower case. Fruit words are matched on the name only, because
// descriptions mention things like "orange cheese sauce".
const RULES: Rule[] = [
  { tag: 'KOREAN', test: (_, t) => /korean/.test(t) },
  { tag: 'PERI_PERI', test: (_, t) => /peri[\s-]*peri/.test(t) },
  { tag: 'MEXICAN', test: (_, t) => /mexican|salsa|nacho/.test(t) },
  {
    tag: 'ITALIAN',
    test: (_, t) =>
      /italian|margherita|sicilia|alfredo|arrabbiata|ala rosey|penne|pasta|garlic bread|olive/.test(
        t,
      ) && !/korean|mexican/.test(t),
  },
  { tag: 'SMOKY', test: (_, t) => /barbeque|barbecue|bbq/.test(t) },
  { tag: 'PANEER', test: (_, t) => /paneer/.test(t) },
  {
    tag: 'SPICY',
    test: (_, t) =>
      /spicy|hot to hell|hot passion|jalape|chilli|chili|chatakedaar|double masala|peri[\s-]*peri/.test(
        t,
      ),
  },
  { tag: 'CHEESY', test: (_, t) => /chees|mozzarella/.test(t) },
  { tag: 'CHOCOLATE', test: (_, t) => /chocolate|oreo|kitkat/.test(t) },
  { tag: 'COFFEE', test: (_, t) => /coffee/.test(t) },
  {
    tag: 'FRUITY',
    test: (n) =>
      /strawberry|mango|pineapple|litchi|orange|peach|cranberry|passion fruit|lemon|blue heaven|blue ice/.test(
        n,
      ),
  },
  { tag: 'MINTY', test: (_, t) => /\bmint\b/.test(t) },
  { tag: 'CREAMY', test: (_, t) => /cream|white sauce|pink sauce|shake/.test(t) },
]

/**
 * Suggested tags for one dish, at most 5. When more match, the rule order above decides which
 * stay (cuisine first, then taste); the result is returned in the canonical FLAVOR_TAGS order.
 */
export function suggestFlavorTags(name: string, description: string): FlavorTagKey[] {
  const n = name.toLowerCase()
  // A side of dip ("…, with cheese dip") does not make a dish cheesy.
  const d = description.toLowerCase().replace(/,?\s*with (a )?cheese dip\.?/g, '')
  const text = `${n} ${d}`
  const matched = RULES.filter((r) => r.test(n, text))
    .slice(0, MAX_FLAVOR_TAGS)
    .map((r) => r.tag)
  return FLAVOR_TAG_KEYS.filter((k) => matched.includes(k))
}
