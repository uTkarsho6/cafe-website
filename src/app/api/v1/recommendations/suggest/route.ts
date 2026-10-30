import { suggestQuerySchema } from '@/lib/validation/reco'
import { apiRoute, ok, parseQuery } from '@/server/http'
import { recoRateLimited } from '@/server/reco/limit'
import { getSuggestions } from '@/server/services/recommendations'

/**
 * GET /api/v1/recommendations/suggest?mood=&budget=&tags= — Help me choose (FR-065/066).
 * Fixed values only (400 otherwise); 429 when rate limited. Stateless: nothing about the guest is stored.
 */
export const GET = apiRoute('GET /api/v1/recommendations/suggest', async (request) => {
  const query = parseQuery(request, suggestQuerySchema)
  const limited = await recoRateLimited()
  if (limited) return limited
  return ok({ suggestions: await getSuggestions(query) })
})
