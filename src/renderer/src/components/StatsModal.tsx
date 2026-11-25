import React from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useSchedulerStore } from '../state/scheduler-store'
import { useTranslation } from '../i18n'
import { Modal } from './ui/Modal'

interface StatsModalProps {
  open: boolean
  onClose: () => void
}

function Bar({ label, value, total }: { label: string; value: number; total: number }): JSX.Element {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="tabular-nums text-ink">
          {value}
          <span className="text-ink-3 text-xs ml-1.5">{pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
        <div className="h-full bg-ink-2 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Snapshot of the currently loaded list plus scheduling queues - a drawer, not a blocking dialog. */
export function StatsModal({ open, onClose }: StatsModalProps): JSX.Element {
  const { t } = useTranslation()
  const { accounts } = useAccountsStore()
  const { messages, folders } = useMailStore()
  const { scheduled, snoozed, followUps } = useSchedulerStore()

  const total = messages.length
  const unread = messages.filter((m) => !m.isRead).length
  const starred = messages.filter((m) => m.isStarred).length
  const withAttachments = messages.filter((m) => m.hasAttachments).length
  const activeAccounts = accounts.filter((a) => a.status === 'active').length

  const figures: [string, number][] = [
    [t('stats.kpi_unread'), unread],
    [t('stats.queue_send_label'), scheduled.length],
    [t('stats.kpi_followups'), followUps.length],
    [t('stats.snoozed_label'), snoozed.length]
  ]

  return (
    <Modal open={open} onClose={onClose} variant="drawer-right" title={t('stats.title')}>
      <p className="text-sm text-ink-2">{t('stats.subtitle')}</p>

      <dl className="mt-5 grid grid-cols-2 border-t border-l border-line">
        {figures.map(([label, value]) => (
          <div key={label} className="px-4 py-3.5 border-r border-b border-line">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="mt-1 font-bold tracking-[-0.02em] text-2xl text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-7">
        <h3 className="eyebrow mb-3">{t('stats.breakdown_title')}</h3>
        <div className="flex flex-col gap-4">
          <Bar label={t('stats.kpi_unread')} value={unread} total={total} />
          <Bar label={t('stats.starred_label')} value={starred} total={total} />
          <Bar label={t('stats.with_attachments')} value={withAttachments} total={total} />
        </div>
        <p className="mt-3 text-xs text-ink-3">{t('stats.all_in_folder')}: {total}</p>
      </section>

      <p className="mt-7 pt-4 border-t border-line text-xs text-ink-2">
        {t('stats.accounts_folders_line', { active: activeAccounts, total: accounts.length, folders: folders.length })}
      </p>
    </Modal>
  )
}
