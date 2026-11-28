import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'

export function MealFoodPicker({ name, label, suggestions }: { name: string; label: string; suggestions: string[] }) {
  const listId = useId()
  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState(false)
  const [active, setActive] = useState(-1)
  const hasHistory = suggestions.length > 0
  const options = filter ? suggestions.filter((meal) => meal.toLowerCase().includes(value.trim().toLowerCase())) : suggestions
  const visible = open && options.length > 0

  useEffect(() => {
    if (!visible) return
    const dismiss = (event: PointerEvent) => {
      if (pickerRef.current && !event.composedPath().includes(pickerRef.current)) {
        setOpen(false)
        setActive(-1)
      }
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [visible])

  useEffect(() => {
    if (visible && active >= 0) listRef.current?.children.item(active)?.scrollIntoView({ block: 'nearest' })
  }, [active, visible])

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function choose(meal: string) {
    setValue(meal)
    close()
    inputRef.current?.focus({ preventScroll: true })
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && visible) {
      event.preventDefault()
      close()
    } else if (event.key === 'Enter' && visible && options[active] !== undefined) {
      event.preventDefault()
      choose(options[active])
    } else if (hasHistory && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      const down = event.key === 'ArrowDown'
      if (!visible) {
        setFilter(false)
        setOpen(true)
        setActive(down ? 0 : suggestions.length - 1)
      } else {
        setActive(down ? Math.min(active + 1, options.length - 1) : active < 0 ? options.length - 1 : Math.max(active - 1, 0))
      }
    }
  }

  return (
    <div
      ref={pickerRef}
      className={`meal-food-picker${hasHistory ? ' has-history' : ''}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}
    >
      <input
        ref={inputRef}
        name={name}
        aria-label={`${label}吃了什么`}
        type="text"
        placeholder="吃了什么"
        maxLength={500}
        autoComplete="off"
        value={value}
        role={hasHistory ? 'combobox' : undefined}
        aria-expanded={hasHistory ? visible : undefined}
        aria-autocomplete={hasHistory ? 'list' : undefined}
        aria-controls={hasHistory ? listId : undefined}
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        onKeyDown={navigate}
        onChange={(event) => {
          setValue(event.target.value)
          setFilter(true)
          setActive(-1)
          setOpen(hasHistory)
        }}
      />
      {hasHistory && (
        <>
          <button
            type="button"
            className="meal-food-toggle"
            aria-label={`${label}常吃选项`}
            aria-controls={listId}
            aria-expanded={visible}
            onClick={() => {
              setFilter(false)
              setActive(-1)
              setOpen(!visible)
              inputRef.current?.focus({ preventScroll: true })
            }}
          ><ChevronDown size={14} aria-hidden="true" /></button>
          <div
            ref={listRef}
            id={listId}
            className={`meal-food-options${visible ? ' is-open' : ''}`}
            role="listbox"
            aria-label={`${label}常吃选项`}
            aria-hidden={!visible}
          >
            {options.map((meal, index) => (
              <button
                id={`${listId}-${index}`}
                key={meal}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={meal === value}
                className={active === index ? 'is-active' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(meal)}
              >{meal}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
