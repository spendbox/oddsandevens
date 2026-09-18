'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Closing a panel when the press lands somewhere else.
 *
 * ## Two rules, and the second one is the one that keeps being missed
 *
 * **Test where the press landed, never stopPropagation.** Relying on
 * propagation closes the panel on pointerdown and unmounts the button before
 * its own click can fire, which is how every control inside one ends up
 * doing nothing.
 *
 * **The button that opened it is not "outside".** It was: pressing the ⋯ a
 * second time closed the menu on pointerdown and then the button's own click
 * toggled it straight back open, so the menu could not be shut by the
 * control that opened it — you had to press somewhere else entirely, which
 * on a phone means guessing at a safe patch of screen. The trigger is passed
 * in and left alone here, so its click does the closing exactly as it looks
 * like it should.
 */
export function useDismiss(
  onClose: () => void,
  /** The panel itself: a press inside it is not a press outside it. */
  panel: RefObject<HTMLElement | null>,
  /** The control that opened it, whose own click does the toggling. */
  trigger?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const away = (event: Event) => {
      const el = event.target as Element | null
      if (!el) return
      if (panel.current?.contains(el)) return
      if (trigger?.current?.contains(el)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, panel, trigger])
}
