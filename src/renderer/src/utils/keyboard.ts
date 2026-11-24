type ShortcutEvent = Pick<KeyboardEvent, 'defaultPrevented' | 'isComposing' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

export function canUsePlainShortcut(e: ShortcutEvent): boolean {
  return !e.defaultPrevented && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey
}

export function hasPrimaryModifier(e: ShortcutEvent): boolean {
  return !e.defaultPrevented && !e.isComposing && !e.altKey && !e.shiftKey && e.ctrlKey !== e.metaKey
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]') !== null
  )
}

export function hasShortcutOverlay(): boolean {
  return document.querySelector('[aria-modal="true"], [role="menu"]') !== null
}

export const primaryModifierLabel = () => /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'
