import React, { useEffect, useState } from 'react'
import { useLabelsStore } from '../state/labels-store'
import { useTranslation } from '../i18n'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import type { LabelSummary } from '@shared/ipc'

interface LabelDialogProps {
  open: boolean
  onClose: () => void
  editingLabel?: LabelSummary | null
  initialLabel?: LabelSummary | null
}

// Muted, mutually distinguishable hues that sit well on the paper palette in both themes.
export const LABEL_COLORS = ['#2f6f5e', '#3d6aa8', '#7a5aa6', '#a1477a', '#b42318', '#b4532a', '#b88a1d', '#5d7d2c', '#2f7f99', '#6b6862']

export function LabelDialog({ open, onClose, editingLabel, initialLabel }: LabelDialogProps): JSX.Element | null {
  const { t } = useTranslation()
  const { createLabel, updateLabel } = useLabelsStore()
  const activeLabel = editingLabel ?? initialLabel
  const [name, setName] = useState('')
  const [color, setColor] = useState(LABEL_COLORS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(activeLabel?.name ?? '')
    setColor(activeLabel?.color ?? LABEL_COLORS[0])
    setError(null)
  }, [activeLabel, open])

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('labels.dialog.error_empty'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (activeLabel) await updateLabel(activeLabel.id, name.trim(), color)
      else await createLabel(name.trim(), color)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const swatches = LABEL_COLORS.includes(color) ? LABEL_COLORS : [...LABEL_COLORS, color]

  return (
    <Modal open={open} onClose={onClose} size="sm" title={activeLabel ? t('labels.dialog.edit_title') : t('labels.dialog.create_title')}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label={t('labels.dialog.name')} error={error}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('labels.dialog.name_placeholder')}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>

        <fieldset>
          <legend className="field-label mb-2">{t('labels.dialog.color')}</legend>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup">
            {swatches.map((c) => (
              <label key={c} className="relative cursor-pointer" title={c}>
                <input type="radio" name="label-color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
                <span
                  className="block w-7 h-7 rounded border-2 border-transparent peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                  style={{ backgroundColor: c, boxShadow: 'inset 0 0 0 2px var(--raised)' }}
                />
              </label>
            ))}
            <label className="ml-1 flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-7 h-7 p-0 border-0 bg-transparent cursor-pointer" aria-label={t('labels.dialog.custom_color')} />
              {t('labels.dialog.custom_color')}
            </label>
          </div>
        </fieldset>

        <div className="flex items-center gap-2 pt-1">
          <span className="chip">
            <span className="chip-dot" style={{ backgroundColor: color }} />
            {name.trim() || t('labels.dialog.name_placeholder')}
          </span>
          <span className="flex-1" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!name.trim()}>
            {t('labels.dialog.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
