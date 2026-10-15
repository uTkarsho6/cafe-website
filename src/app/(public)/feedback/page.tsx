import type { Metadata } from 'next'
import { Container } from '@/components/ui/container'
import { FeedbackForm } from '@/features/feedback/feedback-form'
import { pageMetadata } from '@/lib/site/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Feedback',
  description: 'Tell ZORKO Sangli what you think. Feedback is reviewed before it appears.',
  path: '/feedback',
})

/** Feedback (UI_SPEC §12.9, derived screen; FR-019). */
export default function FeedbackPage() {
  return (
    <main id="main" className="flex-1">
      <div className="bg-surface-warm-cream">
        <Container className="flex flex-col gap-1 py-space-lg">
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Feedback</h1>
          <p className="text-body-md text-on-surface-variant">
            Liked something, or something we can do better? Let the café know.
          </p>
        </Container>
      </div>
      <Container className="py-space-xl">
        <div className="mx-auto max-w-xl rounded-3xl bg-surface-container-lowest p-space-lg shadow-sm md:p-space-xl">
          <FeedbackForm />
        </div>
      </Container>
    </main>
  )
}
