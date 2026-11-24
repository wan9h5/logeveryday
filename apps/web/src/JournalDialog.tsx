import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  className: string
  labelledBy: string
  describedBy?: string
  dismissDisabled?: boolean
  closeOnBackdrop?: boolean
  onClose: () => void
  children: (close: () => void) => ReactNode
}

export function JournalDialog({
  className, labelledBy, describedBy, dismissDisabled, closeOnBackdrop, onClose, children,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = useState(false)
  const close = () => setClosing(true)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className={`journal-dialog ${className}${closing ? ' is-closing' : ''}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault()
        if (!dismissDisabled) close()
      }}
      onClick={(event) => {
        if (!closeOnBackdrop || dismissDisabled || event.target !== event.currentTarget) return
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect()
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close()
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !event.nativeEvent.pseudoElement && event.animationName === 'journal-dialog-out') {
          event.currentTarget.close()
          onClose()
        }
      }}
      onSubmitCapture={(event) => {
        if (closing) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {children(close)}
    </dialog>
  )
}
