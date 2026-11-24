import type { ComponentPropsWithoutRef } from 'react'
import { ChevronDown } from 'lucide-react'

export function JournalSelect(props: ComponentPropsWithoutRef<'select'>) {
  return (
    <span className="journal-select">
      <select {...props} />
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  )
}
