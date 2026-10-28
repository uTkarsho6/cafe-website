import Link from 'next/link'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Badge, AvailabilityLabel } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { Pagination } from '@/components/ui/pagination'
import { Price } from '@/components/ui/price'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { PureVegPill, VegMark } from '@/components/ui/veg-mark'

describe('Button (TC-COMP-001)', () => {
  it('renders an enabled primary button', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('type', 'button')
    // ADR-060: primary = ZORKO orange fill with dark text (white on this orange fails AA).
    expect(button.className).toContain('bg-cta')
    expect(button.className).toContain('text-on-cta')
  })
  it('is disabled and busy while loading', () => {
    render(<Button loading>Saving</Button>)
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
  it('uses the neutral disabled style', () => {
    render(<Button disabled>Nope</Button>)
    expect(screen.getByRole('button', { name: 'Nope' }).className).toContain('cursor-not-allowed')
  })
})

describe('Availability and badges (TC-COMP-002 basics)', () => {
  it('labels unavailable items as out of stock and never as available', () => {
    render(<AvailabilityLabel available={false} />)
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
    expect(screen.queryByText('Available')).not.toBeInTheDocument()
  })
  it('renders badge text', () => {
    render(<Badge tone="bestSeller">Best seller</Badge>)
    expect(screen.getByText('Best seller')).toBeInTheDocument()
  })
})

describe('Veg marks (TC-COMP-004)', () => {
  it('gives the mark an accessible name', () => {
    render(<VegMark diet="NON_VEG" />)
    expect(screen.getByRole('img', { name: 'Non-vegetarian' })).toBeInTheDocument()
  })
  it('hides the 100% VEG claim unless the café confirmed it', () => {
    const { rerender } = render(<PureVegPill confirmed={false} />)
    expect(screen.queryByText('100% VEG')).not.toBeInTheDocument()
    rerender(<PureVegPill confirmed />)
    expect(screen.getByText('100% VEG')).toBeInTheDocument()
  })
})

describe('Price (TC-COMP-003 basics)', () => {
  it('shows struck-through regular price and offer price when discounted', () => {
    render(<Price paise={9900} regularPaise={12900} />)
    expect(screen.getByText('₹129').tagName).toBe('S')
    expect(screen.getByText('₹99')).toBeInTheDocument()
  })
  it('shows a single price otherwise', () => {
    render(<Price paise={9900} regularPaise={9900} />)
    expect(screen.queryByText('Regular price')).not.toBeInTheDocument()
  })
})

describe('TextField (TC-A11Y-004 basics)', () => {
  it('links the error message and marks the field invalid', () => {
    render(<TextField label="Email" error="Enter a valid email address." />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a valid email address.')
  })
  it('uses the hint as description when there is no error', () => {
    render(<TextField label="Name" hint="Optional." />)
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Optional.')
  })
})

describe('States (TC-COMP-005)', () => {
  it('renders the empty-state action', () => {
    render(
      <EmptyState
        title="No dishes match these filters"
        action={<Link href="/menu">Clear all filters</Link>}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'No dishes match these filters' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear all filters' })).toHaveAttribute('href', '/menu')
  })
  it('error state retries and is announced', async () => {
    const onRetry = vi.fn()
    render(<ErrorState title="Couldn't load" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('Switch', () => {
  it('exposes state with role switch and toggles', async () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onChange} label="Available: Demo" />)
    const control = screen.getByRole('switch', { name: 'Available: Demo' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(control)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Pagination (TC-COMP-009)', () => {
  it('marks the current page and builds links that keep filters', () => {
    render(<Pagination page={2} totalPages={3} basePath="/menu" query={{ q: 'tea' }} />)
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/menu?q=tea&page=3',
    )
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/menu?q=tea',
    )
  })
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} basePath="/menu" />)
    expect(container).toBeEmptyDOMElement()
  })
})
