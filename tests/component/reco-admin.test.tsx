import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/toast'

/** TC-COMP-032: admin weights form (Phase R5a). The Server Action is mocked. */
const saveRecoWeightsAction = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/features/admin/reco-actions', () => ({
  saveRecoWeightsAction: (...a: unknown[]) => saveRecoWeightsAction(...a),
  setRecoEnabledAction: vi.fn(),
  retrainAction: vi.fn(),
  activateRunAction: vi.fn(),
}))
vi.mock('@/features/admin/menu-actions', () => ({}))
const { WeightsForm } = await import('@/features/admin/reco/reco-controls')

const W = {
  compCoocPm: 500,
  compQualityPm: 0,
  compContentPm: 500,
  simContentPm: 500,
  simTastePm: 200,
  simQualityPm: 300,
}
const setup = () =>
  render(
    <ToastProvider>
      <WeightsForm weights={W} />
    </ToastProvider>,
  )

describe('WeightsForm (TC-COMP-032)', () => {
  it('shows each weight with its normalised share, per list', () => {
    setup()
    expect(screen.getByRole('spinbutton', { name: 'Co-occurrence' })).toHaveValue(500)
    expect(screen.getAllByText("50 % of this list's score")).toHaveLength(3) // 500/1000 ×2 and sim content
    expect(screen.getByText("20 % of this list's score")).toBeInTheDocument()
    expect(screen.getByText("30 % of this list's score")).toBeInTheDocument()
  })

  it('updates the share live while typing', async () => {
    const user = userEvent.setup()
    setup()
    const taste = screen.getByRole('spinbutton', { name: /Taste/ })
    await user.clear(taste)
    await user.type(taste, '0')
    // content 500 / quality 300 → 63 % / 38 % (rounded), taste 0 %
    expect(screen.getByText("63 % of this list's score")).toBeInTheDocument()
    expect(screen.getByText("38 % of this list's score")).toBeInTheDocument()
  })

  it('shows server field errors linked to the field with aria-describedby', async () => {
    saveRecoWeightsAction.mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields.',
      errors: { simTastePm: 'Taste: enter a whole number from 0 to 1000.' },
    })
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Save weights' }))
    const field = screen.getByRole('spinbutton', { name: /Taste/ })
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    expect(field).toHaveAccessibleDescription(/Taste: enter a whole number/)
    expect(saveRecoWeightsAction.mock.calls[0][1]).toBeInstanceOf(FormData)
  })
})
