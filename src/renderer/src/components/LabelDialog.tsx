import React, { useState, useEffect } from 'react'
import { useLabelsStore } from '../state/labels-store'
import { useTranslation } from '../i18n'
import type { LabelSummary } from '@shared/ipc'

interface LabelDialogProps {
  open: boolean
  onClose: () => void
  editingLabel?: LabelSummary | null
  initialLabel?: LabelSummary | null
}

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#38bdf8', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#64748b'  // Slate
]

export function LabelDialog({ open, onClose, editingLabel, initialLabel }: LabelDialogProps): JSX.Element | null {
  const { t } = useTranslation()
  const { createLabel, updateLabel } = useLabelsStore()
  const activeLabel = editingLabel ?? initialLabel
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeLabel) {
      setName(activeLabel.name)
      setColor(activeLabel.color)
    } else {
      setName('')
      setColor('#6366f1')
    }
    setError(null)
  }, [activeLabel, open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('labels.dialog.error_empty'))
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (activeLabel) {
        await updateLabel(activeLabel.id, name.trim(), color)
      } else {
        await createLabel(name.trim(), color)
      }
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-white dark:bg-surface-elevated rounded-2xl border border-border-subtle dark:border-white/[0.08] shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-on-surface dark:text-white">
            {activeLabel ? t('labels.dialog.edit_title') : t('labels.dialog.create_title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant dark:text-text-muted mb-1.5">
              {t('labels.dialog.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('labels.dialog.name_placeholder')}
              autoFocus
              className="w-full px-3 py-2 rounded-xl text-sm bg-surface-container-highest dark:bg-white/[0.04] border border-border-subtle dark:border-white/[0.08] text-on-surface dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant dark:text-text-muted mb-2">
              {t('labels.dialog.color')}
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'scale-110 ring-2 ring-offset-2 ring-primary dark:ring-offset-background-dark' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
              />
              <span className="text-xs font-mono text-on-surface-variant dark:text-text-muted uppercase">
                {color}
              </span>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle dark:border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant dark:text-text-muted hover:bg-surface-container-highest dark:hover:bg-white/[0.04]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
            >
              {loading ? t('common.loading') : t('labels.dialog.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
