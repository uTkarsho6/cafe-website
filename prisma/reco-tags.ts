/**
 * Initial flavour tags and meal roles (Phase R1, ADR-069). Run: `npm run reco:tags`.
 * Create-only: an item gets suggested tags only while it has none, and a category gets its meal
 * role only while it still has the default (MAIN), so admin edits are never overwritten.
 * The keyword rule is src/lib/reco/tag-rules.ts; the team reviews the result (Q-22).
 */
import { scriptClient } from './client'
import { guardProduction } from './reco-menu'
import { mealRoleForCategory, suggestFlavorTags } from '../src/lib/reco/tag-rules'

async function main() {
  guardProduction('set recommendation tags')
  const db = scriptClient()
  try {
    let roles = 0
    let tagged = 0
    for (const c of await db.menuCategory.findMany({
      select: { id: true, slug: true, mealRole: true },
    })) {
      const role = mealRoleForCategory(c.slug)
      if (c.mealRole === 'MAIN' && role !== 'MAIN') {
        await db.menuCategory.update({ where: { id: c.id }, data: { mealRole: role } })
        roles++
      }
    }
    const items = await db.menuItem.findMany({
      where: { flavorTags: { isEmpty: true } },
      select: { id: true, name: true, description: true },
    })
    for (const i of items) {
      const tags = suggestFlavorTags(i.name, i.description)
      if (tags.length) {
        await db.menuItem.update({ where: { id: i.id }, data: { flavorTags: tags } })
        tagged++
      }
    }
    console.log(
      `Meal roles set: ${roles}. Items tagged: ${tagged} (of ${items.length} without tags).`,
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
