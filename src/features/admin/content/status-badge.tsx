import { Badge, type BadgeTone } from '@/components/ui/badge'

const LABEL: Record<string, [string, BadgeTone]> = {
  active: ['Active', 'offer'],
  scheduled: ['Scheduled', 'scheduled'],
  expired: ['Expired', 'neutral'],
  draft: ['Draft', 'scheduled'],
}

export function OfferStatusBadge({ status }: { status: string }) {
  const [label, tone] = LABEL[status] ?? [status, 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}
