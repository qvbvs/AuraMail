import React, { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useTranslation } from '../../i18n'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
}

/** Zastępuje natywne `window.confirm` (brzydkie, nie pasujące do designu, blokujące
 * cały proces renderera) spójnym modalem aplikacji — używane m.in. przy usuwaniu
 * konta pocztowego i trwałym usuwaniu wiadomości z Kosza. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  loading: externalLoading
}: ConfirmDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [internalBusy, setInternalBusy] = useState(false)
  const busy = externalLoading !== undefined ? externalLoading : internalBusy
  const effectiveConfirmLabel = confirmLabel ?? t('common.confirm')
  const effectiveCancelLabel = cancelLabel ?? t('common.cancel')

  const handleConfirm = async (): Promise<void> => {
    setInternalBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setInternalBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {effectiveCancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} loading={busy}>
            {effectiveConfirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="text-body-sm text-on-surface-variant dark:text-text-muted leading-relaxed">{description}</p>}
    </Modal>
  )
}
