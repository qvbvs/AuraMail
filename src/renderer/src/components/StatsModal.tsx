import React from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useSchedulerStore } from '../state/scheduler-store'
import { useTranslation } from '../i18n'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

interface StatsModalProps {
  open: boolean
  onClose: () => void
}

const RING_RADIUS = 46
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function UnreadRing({ percent, unread, total }: { percent: number; unread: number; total: number }): JSX.Element {
  const offset = RING_CIRCUMFERENCE * (1 - percent / 100)
  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 104 104" className="w-full h-full -rotate-90">
        <circle
          cx="52"
          cy="52"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="9"
          className="stroke-slate-100 dark:stroke-white/[0.06]"
        />
        <circle
          cx="52"
          cy="52"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="stroke-primary dark:stroke-indigo-400 transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-headline text-2xl font-bold text-slate-800 dark:text-slate-100 leading-none">
          {percent}%
        </span>
        <span className="text-[10px] text-slate-400 mt-1">
          {unread} / {total}
        </span>
      </div>
    </div>
  )
}

function BreakdownBar({
  icon,
  iconColor,
  label,
  value,
  max,
  barColor
}: {
  icon: string
  iconColor: string
  label: string
  value: number
  max: number
  barColor: string
}): JSX.Element {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-xs">
          <span className={`material-symbols-outlined text-[15px] ${iconColor}`}>{icon}</span>
          <span>{label}</span>
        </div>
        <span className="font-mono font-semibold text-xs text-slate-800 dark:text-slate-200">{value}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-[width] duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function StatsModal({ open, onClose }: StatsModalProps): JSX.Element {
  const { t } = useTranslation()
  const { accounts } = useAccountsStore()
  const { messages, folders } = useMailStore()
  const { scheduled, snoozed, followUps } = useSchedulerStore()

  const totalMessages = messages.length
  const unreadMessages = messages.filter((m) => !m.isRead).length
  const starredMessages = messages.filter((m) => m.isStarred).length
  const withAttachments = messages.filter((m) => m.hasAttachments).length
  const unreadPercent = totalMessages > 0 ? Math.round((unreadMessages / totalMessages) * 100) : 0
  const activeAccounts = accounts.filter((a) => a.status === 'active').length

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer-right"
      title={
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-primary dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40 flex-shrink-0">
            <span className="material-symbols-outlined text-[20px]">bar_chart</span>
          </span>
          <span className="flex flex-col">
            <span>{t('stats.title')}</span>
            <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500 -mt-0.5">
              {t('stats.subtitle')}
            </span>
          </span>
        </span>
      }
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="text-slate-800 dark:text-slate-100 space-y-4">
        {/* Hero: pierścień nieprzeczytanych */}
        <div className="flex items-center gap-5 p-4 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200/80 dark:border-white/[0.06]">
          <UnreadRing percent={unreadPercent} unread={unreadMessages} total={totalMessages} />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase font-bold text-slate-400">{t('stats.kpi_unread')}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
              {unreadMessages === 0
                ? t('stats.unread_zero')
                : t(unreadMessages === 1 ? 'stats.unread_pending_one' : 'stats.unread_pending_many', { count: unreadMessages })}
            </span>
          </div>
        </div>

        {/* Kolejki */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200/80 dark:border-white/[0.06] flex flex-col gap-1">
            <span className="material-symbols-outlined text-[18px] text-emerald-600 dark:text-emerald-400">schedule_send</span>
            <span className="font-headline text-xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">
              {scheduled.length}
            </span>
            <span className="text-[10px] text-slate-400">{t('stats.queue_send_label')}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200/80 dark:border-white/[0.06] flex flex-col gap-1">
            <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">notifications_active</span>
            <span className="font-headline text-xl font-bold text-amber-600 dark:text-amber-400 leading-none">
              {followUps.length}
            </span>
            <span className="text-[10px] text-slate-400">{t('stats.kpi_followups')}</span>
          </div>
        </div>

        {/* Rozkład wiadomości — proporcjonalne paski względem wszystkich wiadomości */}
        <div className="rounded-xl bg-slate-50/70 dark:bg-[#162030] border border-slate-200 dark:border-white/[0.06] overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-[#121824] border-b border-slate-200 dark:border-white/[0.06] font-semibold text-xs text-slate-700 dark:text-slate-300">
            {t('stats.breakdown_title')}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            <BreakdownBar
              icon="star"
              iconColor="text-amber-500"
              label={t('stats.starred_label')}
              value={starredMessages}
              max={totalMessages}
              barColor="bg-amber-500"
            />
            <BreakdownBar
              icon="attachment"
              iconColor="text-primary dark:text-indigo-400"
              label={t('stats.with_attachments')}
              value={withAttachments}
              max={totalMessages}
              barColor="bg-primary dark:bg-indigo-400"
            />
            <BreakdownBar
              icon="snooze"
              iconColor="text-slate-400"
              label={t('stats.snoozed_label')}
              value={snoozed.length}
              max={totalMessages}
              barColor="bg-slate-400"
            />
          </div>
        </div>

        {/* Status kont/folderów */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
            <span>
              {t('stats.accounts_folders_line', { active: activeAccounts, total: accounts.length, folders: folders.length })}
            </span>
          </div>
          {activeAccounts > 0 && (
            <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-900/40 px-2 py-0.5 rounded font-semibold">
              {t('stats.connected_badge')}
            </span>
          )}
        </div>
      </div>
    </Modal>
  )
}
