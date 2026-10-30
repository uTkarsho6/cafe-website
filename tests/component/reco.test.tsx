import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { chooseHref, parseChooseParams } from '@/features/reco/choose-params'
import { FlavourChips, RecoSection } from '@/features/reco/reco-parts'
import type { RecoCardDto } from '@/server/services/recommendations'

vi.mock('next/form', () => ({
  default: ({ action, ...props }: React.ComponentProps<'form'> & { action: string }) => (
    <form action={action} method="get" {...props} />
  ),
}))
const { ChooseForm } = await import('@/features/reco/choose-form')

/** Phase R4: TC-COMP-030 (recommendation section) and TC-COMP-031 (Help me choose form). */

const card = (n: number, reasons: RecoCardDto['reasons'] = []): RecoCardDto => ({
  id: `id-${n}`,
  slug: `dish-${n}`,
  name: `Dish ${n}`,
  description: 'Demo item',
  pricePaise: 9900 + n * 100,
  priceLabel: `₹${99 + n}`,
  dietType: 'VEG',
  isAvailable: true,
  isBestSeller: false,
  isTrending: false,
  isFeatured: false,
  hasActiveOffer: false,
  category: { slug: 'burgers', name: 'Burgers' },
  image: null,
  reasons,
})

describe('RecoSection (TC-COMP-030)', () => {
  const items = [
    card(1, [
      { code: 'ADMIN_PICK', label: 'Café pick' },
      { code: 'BEST_SELLER', label: 'Best seller' },
    ]),
    card(2, [{ code: 'PAIRS_WITH_ROLE', label: 'A drink to go with it' }]),
    card(3),
    card(4, [{ code: 'SHARED_TAGS', label: 'Also spicy' }]),
  ]

  it('renders a labelled section with 4 linked rows, name and price', () => {
    render(<RecoSection id="gww" title="Goes well with" items={items} />)
    const section = screen.getByRole('region', { name: 'Goes well with' })
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[0]).toHaveAttribute('href', '/menu/dish-1')
    expect(links[0]).toHaveTextContent('Dish 1')
    expect(links[0]).toHaveTextContent('₹100')
  })

  it('shows one reason chip per row (the first), and none when there is no reason', () => {
    render(<RecoSection id="gww" title="Goes well with" items={items} />)
    const [first, second, third] = screen.getAllByRole('link')
    expect(first).toHaveTextContent('Café pick')
    expect(first).not.toHaveTextContent('Best seller')
    expect(second).toHaveTextContent('A drink to go with it')
    expect(within(third).queryByRole('list', { name: 'Why we suggest it' })).toBeNull()
  })

  it('is hidden when empty', () => {
    const { container } = render(<RecoSection id="x" title="You may also like" items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('has no ordering controls and no rating language', () => {
    render(<RecoSection id="gww" title="Goes well with" items={items} footer={<p>caption</p>} />)
    expect(screen.queryByRole('button')).toBeNull()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/add to|order|cart|★|rating|people who|frequently bought/i)
    expect(screen.getByText('caption')).toBeInTheDocument()
  })

  it('flavour chips: at most 5, hidden when none', () => {
    const { container, rerender } = render(<FlavourChips flavours={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(
      <FlavourChips flavours={['Spicy', 'Cheesy', 'Korean', 'Italian', 'Paneer', 'Minty']} />,
    )
    expect(
      within(screen.getByRole('list', { name: 'Flavours' })).getAllByRole('listitem'),
    ).toHaveLength(5)
  })
})

describe('ChooseForm (TC-COMP-031)', () => {
  const empty = parseChooseParams({})

  it('uses native radios and checkboxes with associated labels, in 3 fieldsets', () => {
    render(<ChooseForm params={empty} />)
    expect(screen.getAllByRole('group')).toHaveLength(3)
    const mood = screen.getByRole('group', { name: 'What are you in the mood for?' })
    expect(within(mood).getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'A meal' })).toBeRequired()
    expect(screen.getByRole('radio', { name: 'Any' })).toBeChecked() // default budget
    expect(screen.getByRole('radio', { name: '₹100–₹200' })).toHaveAttribute('value', '100-200')
    expect(screen.getByRole('checkbox', { name: 'Spicy' })).toHaveAttribute('name', 'tags')
    expect(screen.getAllByRole('checkbox')).toHaveLength(13)
    expect(screen.getByRole('form', { name: 'Help me choose' })).toHaveAttribute(
      'action',
      '/help-me-choose',
    )
    expect(screen.getByRole('link', { name: 'Start over' })).toHaveAttribute(
      'href',
      '/help-me-choose',
    )
  })

  it('pre-selects the answers from the URL', () => {
    render(
      <ChooseForm
        params={parseChooseParams({ mood: 'drink', budget: 'under-100', tags: ['COFFEE'] })}
      />,
    )
    expect(screen.getByRole('radio', { name: 'A drink' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Under ₹100' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Coffee' })).toBeChecked()
  })

  it('refuses a fourth flavour with an inline message, and clears it after an untick', async () => {
    const user = userEvent.setup()
    render(<ChooseForm params={empty} />)
    for (const name of ['Spicy', 'Cheesy', 'Korean'])
      await user.click(screen.getByRole('checkbox', { name }))
    await user.click(screen.getByRole('checkbox', { name: 'Minty' }))
    expect(screen.getByRole('checkbox', { name: 'Minty' })).not.toBeChecked()
    expect(screen.getByRole('alert')).toHaveTextContent('up to 3 flavours')
    const tags = screen.getByRole('group', { name: /Flavours you like/ })
    expect(tags).toHaveAttribute('aria-describedby', 'tags-hint')
    await user.click(screen.getByRole('checkbox', { name: 'Spicy' }))
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Minty' }))
    expect(screen.getByRole('checkbox', { name: 'Minty' })).toBeChecked()
  })

  it('shows the server-side message when the URL has more than 3 flavours', () => {
    render(
      <ChooseForm
        params={parseChooseParams({ mood: 'meal', tags: 'SPICY,CHEESY,KOREAN,MINTY' })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Choose up to 3 flavours.')
  })
})

describe('Help me choose URL state', () => {
  it('ignores unknown values, keeps known ones, canonical tag order', () => {
    expect(
      parseChooseParams({ mood: 'pizza', budget: 'free', tags: ['<script>', 'CHEESY', 'SPICY'] }),
    ).toEqual({
      mood: null,
      budget: 'any',
      tags: ['SPICY', 'CHEESY'],
      tooManyTags: false,
    })
    expect(parseChooseParams({ mood: ['meal', 'drink'], tags: 'SPICY,SPICY' }).mood).toBe('meal')
    expect(parseChooseParams({ tags: 'SPICY,SPICY' }).tags).toEqual(['SPICY'])
  })

  it('flags more than 3 flavours', () => {
    const p = parseChooseParams({ mood: 'meal', tags: ['SPICY', 'CHEESY', 'KOREAN', 'MINTY'] })
    expect(p.tooManyTags).toBe(true)
  })

  it('builds shareable links that round-trip', () => {
    const href = chooseHref({ mood: 'meal', budget: '100-200', tags: ['SPICY', 'CHEESY'] })
    expect(href).toBe('/help-me-choose?mood=meal&budget=100-200&tags=SPICY&tags=CHEESY')
    const q = new URLSearchParams(href.split('?')[1])
    expect(
      parseChooseParams({ mood: q.get('mood')!, budget: q.get('budget')!, tags: q.getAll('tags') }),
    ).toEqual({
      mood: 'meal',
      budget: '100-200',
      tags: ['SPICY', 'CHEESY'],
      tooManyTags: false,
    })
    expect(chooseHref({})).toBe('/help-me-choose')
    expect(chooseHref({ mood: 'drink', budget: 'any' })).toBe('/help-me-choose?mood=drink')
  })
})
