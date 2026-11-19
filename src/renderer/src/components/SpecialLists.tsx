import React, { useEffect } from 'react'
import { useSchedulerStore } from '../state/scheduler-store'
import { useMailStore } from '../state/mail-store'
import { useTranslation } from '../i18n'
import { EmptyState } from './ui/EmptyState'
import { Skeleton } from './ui/Skeleton'
import { Icon, IconButton } from './ui/Button'

interface RowProps {
  title: string
  subtitle: string
  meta: React.ReactNode
  metaIcon: string
  error?: string | null
  action?: React.ReactNode
  onOpen?: () => void
  selected?: boolean
}

function Row({ title, subtitle, meta, metaIcon, error, action, onOpen, selected }: RowProps): JSX.Element {
  return (
    <li className={`group relative flex items-start gap-2 pl-4 pr-2 py-2.5 border-b border-line ${selected ? 'bg-selected' : 'hover:bg-hover'}`}>
      {selected && <span className="absolute left-0 inset-y-0 w-[3px] bg-accent" aria-hidden="true" />}
      <button type="button" onClick={onOpen} disabled={!onOpen} className="flex-1 min-w-0 text-left disabled:cursor-default">
        <span className="block truncate text-sm text-ink font-medium">{title}</span>
        <span className="block truncate text-xs text-ink-3 mt-0.5">{subtitle}</span>
        <span className="flex items-center gap-1 mt-1 text-xs text-ink-2">
          <Icon name={metaIcon} className="!text-[14px] text-ink-3" />
          {meta}
        </span>
        {error && <span className="block mt-1 text-xs text-danger">{error}</span>}
      </button>
      {action}
    </li>
  )
}

/** Scheduled / snoozed / follow-up lists, shown in the list pane in place of a folder. */
export function SpecialLists(): JSX.Element {
  const { t, formatDate } = useTranslation()
  const { view, scheduled, snoozed, followUps, loading, showView, cancelScheduled, cancelFollowUp } = useSchedulerStore()
  const { selectMessage, selectedMessageId } = useMailStore()

  useEffect(() => {
    if (view !== 'none') showView(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const when = (iso: string): string => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const config = {
    scheduled: { title: t('specialLists.scheduled.title'), count: scheduled.length, icon: 'schedule_send' },
    snoozed: { title: t('specialLists.snoozed.title'), count: snoozed.length, icon: 'snooze' },
    followups: { title: t('specialLists.followups.title'), count: followUps.length, icon: 'flag' }
  }[view as 'scheduled' | 'snoozed' | 'followups']
  if (!config) return <></>

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-4 pt-3.5 pb-3 border-b border-line flex items-baseline gap-2">
        <h1 className="font-serif text-xl font-medium text-ink">{config.title}</h1>
        <span className="text-xs text-ink-3 tabular-nums">{config.count}</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-3 border-b border-line flex flex-col gap-2">
                <Skeleton width="70%" />
                <Skeleton width="40%" height={10} />
              </div>
            ))}
          </div>
        ) : config.count === 0 ? (
          <EmptyState icon={config.icon} title={t(`specialLists.${view}.empty_title`)} description={t(`specialLists.${view}.empty_desc`)} />
        ) : (
          <ul>
            {view === 'scheduled' &&
              scheduled.map((s) => (
                <Row
                  key={s.id}
                  title={s.subject || t('specialLists.no_subject')}
                  subtitle={t('specialLists.to_prefix', { addr: s.to.join(', ') })}
                  metaIcon={s.status === 'failed' ? 'error' : 'schedule_send'}
                  meta={t('specialLists.scheduled.send_at', { date: when(s.sendAt) })}
                  error={s.status === 'failed' ? s.lastError : null}
                  action={<IconButton icon="close" size="sm" label={t('specialLists.scheduled.cancel')} onClick={() => cancelScheduled(s.id)} />}
                />
              ))}
            {view === 'snoozed' &&
              snoozed.map((s) => (
                <Row
                  key={s.id}
                  title={s.subject || t('specialLists.no_subject')}
                  subtitle={s.fromName || s.fromAddr}
                  metaIcon="alarm"
                  meta={t('specialLists.snoozed.returns_at', { date: when(s.snoozeUntil) })}
                  onOpen={() => selectMessage(s.id)}
                  selected={selectedMessageId === s.id}
                />
              ))}
            {view === 'followups' &&
              followUps.map((f) => (
                <Row
                  key={f.id}
                  title={f.subject || t('specialLists.no_subject')}
                  subtitle={t('specialLists.to_prefix', { addr: f.toAddr })}
                  metaIcon="notifications"
                  meta={t('specialLists.followups.reminder_at', { date: when(f.remindAfter) })}
                  action={<IconButton icon="close" size="sm" label={t('specialLists.followups.cancel')} onClick={() => cancelFollowUp(f.id)} />}
                />
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}
