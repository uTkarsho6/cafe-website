import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 w-fit items-center gap-2 text-label-md text-primary hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {children}
    </Link>
  )
}
