import React, { useEffect } from 'react'
import { useSchedulerStore } from '../state/scheduler-store'
import { useTranslation } from '../i18n'
import { EmptyState } from './ui/EmptyState'

export function SpecialLists(): JSX.Element {
  const { t, locale } = useTranslation()
  const { view, scheduled, snoozed, followUps, loading, showView, cancelScheduled, cancelFollowUp } = useSchedulerStore()

  const formatDateTime = (iso: string): string => {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  useEffect(() => {
    if (view !== 'none') showView(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  if (loading) {
    return (
      <div className="p-4 flex flex-col gap-3">
        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-xl bg-white dark:bg-[#121826] border border-slate-100 dark:border-white/[0.04] space-y-2">
            <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-800/60 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (view === 'scheduled') {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-slate-50/70 dark:bg-[#0f1522]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-[#121826]/80 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">schedule_send</span>
            <h2 className="font-headline text-base font-bold text-slate-900 dark:text-white">
              {t('specialLists.scheduled.title')}
            </h2>
          </div>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-primary dark:text-indigo-300 font-semibold border border-indigo-200/50">
            {scheduled.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {scheduled.length === 0 && (
            <EmptyState
              icon={<span className="material-symbols-outlined text-[32px]">schedule_send</span>}
              title={t('specialLists.scheduled.empty_title')}
              description={t('specialLists.scheduled.empty_desc')}
            />
          )}
          {scheduled.map((s) => (
            <div
              key={s.id}
              className="p-3.5 rounded-xl bg-white dark:bg-[#151e2d] border border-slate-200/80 dark:border-white/[0.06] shadow-2xs flex flex-col gap-1 relative group"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                    {s.subject || t('specialLists.no_subject')}
                  </h4>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    {t('specialLists.to_prefix', { addr: s.to.join(', ') })}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[11px] text-primary dark:text-indigo-400 font-medium">
                    <span className="material-symbols-outlined text-[14px]">event</span>
                    <span>{t('specialLists.scheduled.send_at', { date: formatDateTime(s.sendAt) })}</span>
                  </div>
                  {s.status === 'failed' && (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-1">
                      {s.lastError}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  title={t('specialLists.scheduled.cancel')}
                  onClick={() => cancelScheduled(s.id)}
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'snoozed') {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-slate-50/70 dark:bg-[#0f1522]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-[#121826]/80 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-amber-500">snooze</span>
            <h2 className="font-headline text-base font-bold text-slate-900 dark:text-white">
              {t('specialLists.snoozed.title')}
            </h2>
          </div>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200/50">
            {snoozed.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {snoozed.length === 0 && (
            <EmptyState
              icon={<span className="material-symbols-outlined text-[32px]">snooze</span>}
              title={t('specialLists.snoozed.empty_title')}
              description={t('specialLists.snoozed.empty_desc')}
            />
          )}
          {snoozed.map((s) => (
            <div
              key={s.id}
              className="p-3.5 rounded-xl bg-white dark:bg-[#151e2d] border border-slate-200/80 dark:border-white/[0.06] shadow-2xs flex flex-col gap-1"
            >
              <h4 className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                {s.subject}
              </h4>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                {s.fromName || s.fromAddr}
              </p>
              <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                <span className="material-symbols-outlined text-[14px]">alarm</span>
                <span>{t('specialLists.snoozed.returns_at', { date: formatDateTime(s.snoozeUntil) })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'followups') {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-slate-50/70 dark:bg-[#0f1522]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-[#121826]/80 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">flag</span>
            <h2 className="font-headline text-base font-bold text-slate-900 dark:text-white">
              {t('specialLists.followups.title')}
            </h2>
          </div>
          <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-primary dark:text-indigo-300 font-semibold border border-indigo-200/50">
            {followUps.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {followUps.length === 0 && (
            <EmptyState
              icon={<span className="material-symbols-outlined text-[32px]">flag</span>}
              title={t('specialLists.followups.empty_title')}
              description={t('specialLists.followups.empty_desc')}
            />
          )}
          {followUps.map((f) => (
            <div
              key={f.id}
              className="p-3.5 rounded-xl bg-white dark:bg-[#151e2d] border border-slate-200/80 dark:border-white/[0.06] shadow-2xs flex justify-between items-start gap-2"
            >
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                  {f.subject || t('specialLists.no_subject')}
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  {t('specialLists.to_prefix', { addr: f.toAddr })}
                </p>
                <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] text-primary dark:text-indigo-400 font-medium">
                  <span className="material-symbols-outlined text-[14px]">notification_important</span>
                  <span>{t('specialLists.followups.reminder_at', { date: formatDateTime(f.remindAfter) })}</span>
                </div>
              </div>
              <button
                type="button"
                title={t('specialLists.followups.cancel')}
                onClick={() => cancelFollowUp(f.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return <></>
}
