import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export type SavePosition = 'bottom' | 'top'

const positions = [
  { value: 'bottom', label: '追加到底部' },
  { value: 'top', label: '添加到顶部' },
] as const

export function SavePositionPicker({ value, onChange }: {
  value: SavePosition
  onChange: (value: SavePosition) => void
}) {
  const listId = useId()
  const pickerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const options = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const selectedIndex = positions.findIndex((position) => position.value === value)
  const selectedLabel = positions[selectedIndex].label

  useEffect(() => {
    if (!open) return
    options.current[selectedIndex]?.focus({ preventScroll: true })

    const dismissOutside = (event: PointerEvent) => {
      const picker = pickerRef.current
      if (picker && !event.composedPath().includes(picker)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [open, selectedIndex])

  const closeAndFocusTrigger = () => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeAndFocusTrigger()
      return
    }

    const arrow = event.key === 'ArrowDown' || event.key === 'ArrowUp'
    if (!open) {
      if (arrow) {
        event.preventDefault()
        setOpen(true)
      }
      return
    }
    if (!arrow && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()

    const focusedIndex = options.current.findIndex((option) => option === event.target)
    const lastIndex = positions.length - 1
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? lastIndex
        : event.key === 'ArrowDown' ? Math.min(focusedIndex + 1, lastIndex)
          : Math.max(0, focusedIndex - 1)
    options.current[nextIndex]?.focus({ preventScroll: true })
  }

  return (
    <div
      ref={pickerRef}
      className="save-position-picker"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="save-position-trigger"
        aria-label={`保存位置：${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((previous) => !previous)}
      >
        {selectedLabel}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div
        className={`save-position-options${open ? ' is-open' : ''}`}
        id={listId}
        role="listbox"
        aria-label="保存位置"
        aria-hidden={!open}
      >
        {positions.map((position, index) => (
          <button
            key={position.value}
            ref={(option) => { options.current[index] = option }}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={position.value === value}
            onClick={() => {
              if (!open) return
              onChange(position.value)
              closeAndFocusTrigger()
            }}
          >
            {position.label}
            {position.value === value && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  )
}
