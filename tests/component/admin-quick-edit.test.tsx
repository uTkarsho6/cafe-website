import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/toast'

/**
 * TC-COMP-020: inline price and label toggles in the admin item list (Round 2C). The Server
 * Actions are mocked; their authorization and validation are covered in
 * tests/unit/admin-menu-actions.test.ts and against the database in tests/integration.
 */
const setPriceAction = vi.fn()
const setItemFlagAction = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/features/admin/menu-actions', () => ({
  setPriceAction: (...a: unknown[]) => setPriceAction(...a),
  setItemFlagAction: (...a: unknown[]) => setItemFlagAction(...a),
  setAvailabilityAction: vi.fn(),
  setItemArchivedAction: vi.fn(),
  deleteItemAction: vi.fn(),
}))

const { FlagToggles, PriceEditor } = await import('@/features/admin/menu/item-controls')
const ID = 'cmf0000000000000000000001'
const ok = (message: string) => ({ ok: true, message, errors: {} })

beforeEach(() => vi.clearAllMocks())

describe('PriceEditor (TC-COMP-020)', () => {
  const setup = () =>
    render(
      <ToastProvider>
        <PriceEditor itemId={ID} name="Paneer Wrap" pricePaise={14900} />
      </ToastProvider>,
    )

  it('shows the price in rupees and saves on Enter', async () => {
    setPriceAction.mockResolvedValue(ok('"Paneer Wrap" now costs ₹159.'))
    setup()
    const input = screen.getByRole('textbox', { name: 'Price of Paneer Wrap in rupees' })
    expect(input).toHaveValue('149')
    await userEvent.clear(input)
    await userEvent.type(input, '159{Enter}')
    await waitFor(() => expect(setPriceAction).toHaveBeenCalledWith(ID, '159'))
    expect(await screen.findByText('"Paneer Wrap" now costs ₹159.')).toBeInTheDocument()
  })

  it('does not call the server when nothing changed, and Escape restores the saved price', async () => {
    setup()
    const input = screen.getByRole('textbox', { name: 'Price of Paneer Wrap in rupees' })
    await userEvent.type(input, '9{Escape}')
    expect(input).toHaveValue('149')
    await userEvent.tab()
    expect(setPriceAction).not.toHaveBeenCalled()
  })

  it('shows the server error next to the field and marks it invalid', async () => {
    setPriceAction.mockResolvedValue({
      ok: false,
      message: 'Price: enter rupees, e.g. 149 or 149.50.',
      errors: {},
    })
    setup()
    const input = screen.getByRole('textbox', { name: 'Price of Paneer Wrap in rupees' })
    await userEvent.clear(input)
    await userEvent.type(input, 'abc{Enter}')
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(input).toHaveAccessibleDescription('Price: enter rupees, e.g. 149 or 149.50.')
  })
})

describe('FlagToggles (TC-COMP-021)', () => {
  const setup = () =>
    render(
      <ToastProvider>
        <FlagToggles
          itemId={ID}
          name="Paneer Wrap"
          flags={{ isBestSeller: true, isTrending: false, isFeatured: false }}
        />
      </ToastProvider>,
    )

  it('shows each label as a pressed / not pressed toggle and saves one click', async () => {
    setItemFlagAction.mockResolvedValue(ok('Marked "Paneer Wrap" as Trending.'))
    setup()
    expect(screen.getByRole('group', { name: 'Labels for Paneer Wrap' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Best seller' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const trending = screen.getByRole('button', { name: 'Trending' })
    expect(trending).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(trending)
    expect(setItemFlagAction).toHaveBeenCalledWith(ID, 'isTrending', true)
    await waitFor(() => expect(trending).toHaveAttribute('aria-pressed', 'true'))
  })

  it('reverts the toggle when the server refuses', async () => {
    setItemFlagAction.mockResolvedValue({ ok: false, message: 'Something went wrong.', errors: {} })
    setup()
    const best = screen.getByRole('button', { name: 'Best seller' })
    await userEvent.click(best)
    expect(setItemFlagAction).toHaveBeenCalledWith(ID, 'isBestSeller', false)
    await waitFor(() => expect(best).toHaveAttribute('aria-pressed', 'true'))
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument()
  })
})
