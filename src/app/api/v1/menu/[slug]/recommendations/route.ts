import { slugSchema } from '@/lib/validation/public'
import { ApiError, apiRoute, ok } from '@/server/http'
import { recoRateLimited } from '@/server/reco/limit'
import { getItemRecommendations } from '@/server/services/recommendations'

/**
 * GET /api/v1/menu/[slug]/recommendations — "Goes well with" and "You may also like" for a dish
 * (FR-063/064/066). 404 for missing, unpublished or archived dishes; 429 when rate limited.
 * Only public card fields and reason labels are returned (no scores, ratings or run ids).
 */
export const GET = apiRoute(
  'GET /api/v1/menu/[slug]/recommendations',
  async (_request, ctx: RouteContext<'/api/v1/menu/[slug]/recommendations'>) => {
    const parsed = slugSchema.safeParse((await ctx.params).slug)
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Invalid item slug.')
    const limited = await recoRateLimited()
    if (limited) return limited
    const data = await getItemRecommendations(parsed.data)
    if (!data) throw new ApiError('NOT_FOUND', 'Menu item not found.')
    return ok(data)
  },
)
