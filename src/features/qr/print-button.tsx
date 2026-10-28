'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Opens the browser's print dialog; print styles keep only the table cards (ADR-061). */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button icon={<Printer aria-hidden="true" className="size-4" />} onClick={() => window.print()}>
      {label}
    </Button>
  )
}
