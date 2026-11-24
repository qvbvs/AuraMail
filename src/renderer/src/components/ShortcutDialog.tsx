import React, { useEffect, useRef } from 'react'
import { useTranslation } from '../i18n'
import { primaryModifierLabel } from '../utils/keyboard'
import { Modal } from './ui/Modal'

export function ShortcutDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const modifier = primaryModifierLabel()
  const returnFocusRef = useRef<Element | null>(null)
  useEffect(() => {
    if (open) returnFocusRef.current = document.activeElement
  }, [open])

  const restoreFocus = (): void => {
    const trigger = returnFocusRef.current
    if (trigger instanceof HTMLElement && trigger.isConnected && document.activeElement === document.body) trigger.focus()
  }

  const shortcuts = [
    ['commandPalette.aria_label', `${modifier}+K`],
    ['commandPalette.settings_integrations', `${modifier}+,`],
    ['commandPalette.compose_new', 'C'],
    ['shortcuts.focus_search', '/'],
    ['commandPalette.go_inbox_folder', 'Shift+I'],
    ['commandPalette.sync_now', 'Shift+S'],
    ['shortcuts.cycle_panes', 'F6 / Shift+F6'],
    ['shortcuts.navigate_messages', '↑ / ↓ · K / J'],
    ['shortcuts.toggle_star', 'S'],
    ['shortcuts.toggle_read', 'U'],
    ['shortcuts.toggle_pin', 'P'],
    ['reader.archive', 'E'],
    ['reader.delete', 'Delete'],
    ['reader.reply', 'R'],
    ['reader.forward', 'F'],
    ['composer.send', `${modifier}+Enter`],
    ['composer.close', 'Esc']
  ]

  return (
    <Modal open={open} onClose={onClose} onAfterClose={restoreFocus} title={t('shortcuts.title')}>
      <dl className="divide-y divide-line">
        {shortcuts.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2 text-sm">
            <dt>{t(label)}</dt>
            <dd><kbd className="kbd whitespace-nowrap">{keys}</kbd></dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
