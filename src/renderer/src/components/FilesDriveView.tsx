import React, { useEffect, useMemo, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useTranslation } from '../i18n'
import type { AttachmentWithMessage } from '@shared/ipc'

interface FilesDriveViewProps {
  onBackToMail: () => void
  onOpenThread: () => void
}

type FileFilter = 'all' | 'docs' | 'sheets' | 'media' | 'archives' | 'other'
type ViewMode = 'grid' | 'table'

const FILTER_MIME_MATCHERS: Record<Exclude<FileFilter, 'all'>, (mime: string, filename: string) => boolean> = {
  docs: (mime, name) => mime.includes('pdf') || mime.includes('word') || /\.(pdf|docx?|txt|rtf)$/i.test(name),
  sheets: (mime, name) => mime.includes('sheet') || mime.includes('excel') || /\.(xlsx?|csv)$/i.test(name),
  media: (mime, name) => mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/') || /\.(png|jpe?g|gif|webp|mp4|mp3|mov)$/i.test(name),
  archives: (mime, name) => mime.includes('zip') || mime.includes('compressed') || /\.(zip|tar|gz|rar|7z)$/i.test(name),
  other: () => true
}

function classify(mime: string, filename: string): Exclude<FileFilter, 'all'> {
  if (FILTER_MIME_MATCHERS.docs(mime, filename)) return 'docs'
  if (FILTER_MIME_MATCHERS.sheets(mime, filename)) return 'sheets'
  if (FILTER_MIME_MATCHERS.media(mime, filename)) return 'media'
  if (FILTER_MIME_MATCHERS.archives(mime, filename)) return 'archives'
  return 'other'
}

const FILTER_ICON: Record<Exclude<FileFilter, 'all'>, { icon: string; color: string }> = {
  docs: { icon: 'picture_as_pdf', color: 'text-error bg-error-container/40 dark:bg-rose-950 dark:text-rose-400' },
  sheets: { icon: 'table_chart', color: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400' },
  media: { icon: 'image', color: 'text-secondary bg-secondary-fixed/50 dark:bg-blue-950 dark:text-blue-300' },
  archives: { icon: 'folder_zip', color: 'text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-400' },
  other: { icon: 'draft', color: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300' }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesDriveView({ onBackToMail, onOpenThread }: FilesDriveViewProps): JSX.Element {
  const { t, locale } = useTranslation()

  const formatDate = (iso: string | null): string => {
    if (!iso) return '—'
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return t('files.today_prefix', { time: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })
    }
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const { accounts, selectedAccountId } = useAccountsStore()
  const activeAccountId = selectedAccountId || accounts[0]?.id || null
  const selectMessage = useMailStore((s) => s.selectMessage)

  const [attachments, setAttachments] = useState<AttachmentWithMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FileFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null)

  const refresh = async (accountId: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.mailapp.attachments.listAll(accountId)
      setAttachments(list)
      if (list.length > 0 && !selectedFileId) setSelectedFileId(list[0].id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeAccountId) refresh(activeAccountId)
  }, [activeAccountId])

  // Odśwież listę po zakończeniu synchronizacji IMAP (ręcznej lub automatycznej w tle).
  useEffect(() => {
    const cleanup = window.mailapp?.sync?.onAutoSyncCompleted?.(() => {
      if (activeAccountId) refresh(activeAccountId)
    })
    return () => cleanup?.()
  }, [activeAccountId])

  const files = useMemo(
    () =>
      attachments.map((a) => ({
        ...a,
        kind: classify(a.mimeType, a.filename)
      })),
    [attachments]
  )

  const filteredFiles = files.filter((f) => {
    if (filter !== 'all' && f.kind !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        f.filename.toLowerCase().includes(q) ||
        f.senderName.toLowerCase().includes(q) ||
        f.senderEmail.toLowerCase().includes(q)
      )
    }
    return true
  })

  const activeFile = files.find((f) => f.id === selectedFileId) || filteredFiles[0]
  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0)

  const handleDownload = async (file: AttachmentWithMessage): Promise<void> => {
    setDownloadMessage(null)
    const dir = await window.mailapp.files.pickSaveDirectory()
    if (!dir) return
    setDownloading(true)
    try {
      const result = await window.mailapp.messages.downloadAttachment(file.messageId, file.position, dir)
      setDownloadMessage(t('files.download_saved', { path: result.localPath }))
    } catch (err) {
      setDownloadMessage(t('files.download_error', { error: (err as Error).message }))
    } finally {
      setDownloading(false)
    }
  }

  const handleOpenThread = (file: AttachmentWithMessage): void => {
    selectMessage(file.messageId)
    onOpenThread()
  }

  if (!activeAccountId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-background dark:bg-[#0b0f19] text-on-surface dark:text-slate-100">
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant">attachment</span>
        <p className="text-body-sm text-on-surface-variant dark:text-text-muted">
          {t('files.no_account')}
        </p>
        <button type="button" onClick={onBackToMail} className="text-primary dark:text-indigo-400 font-semibold text-body-sm">
          {t('files.back_to_mail')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background dark:bg-[#0b0f19] text-on-surface dark:text-slate-100 select-none">
      {/* Top Header & Search Bar */}
      <section className="bg-surface-container-lowest dark:bg-[#121826] p-space-md border-b border-border-subtle dark:border-white/[0.06] shadow-sm space-y-space-md z-10">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <button
              type="button"
              onClick={onBackToMail}
              className="p-1.5 rounded-xl hover:bg-surface-container-high dark:hover:bg-slate-800 text-on-surface-variant dark:text-text-muted hover:text-on-surface dark:hover:text-white transition-colors flex items-center gap-1 text-caption"
              title={t('files.back_to_mail')}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span className="hidden sm:inline font-semibold">{t('files.back_to_mail')}</span>
            </button>

            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[22px]">attachment</span>
              <h1 className="font-headline-lg text-headline-lg text-on-surface dark:text-white font-bold">{t('files.title')}</h1>
            </div>

            <div className="flex items-center gap-1.5 font-label-mono text-caption text-on-surface-variant dark:text-text-muted bg-surface-container dark:bg-slate-800 px-2 py-0.5 rounded-full">
              <span className={`w-1.5 h-1.5 rounded-full bg-primary ${loading ? 'animate-pulse' : ''}`} />
              <span>{t('files.stats_count', { count: files.length })}</span>
              <span className="opacity-40">•</span>
              <span>{formatBytes(totalBytes)}</span>
            </div>
          </div>

          <div className="flex items-center gap-space-xs">
            <button
              type="button"
              onClick={() => activeAccountId && refresh(activeAccountId)}
              disabled={loading}
              className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-xl bg-surface-container-low dark:bg-slate-800 text-on-surface dark:text-white hover:bg-surface-container text-label-md font-label-md transition-colors border border-border-subtle dark:border-white/[0.04] disabled:opacity-50"
              title={t('files.refresh_tooltip')}
            >
              <span className={`material-symbols-outlined text-[16px] text-primary dark:text-indigo-400 ${loading ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span>{loading ? t('files.loading_short') : t('common.refresh')}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md pt-space-xs">
          <div className="relative flex-1 max-w-xl">
            <div className="flex items-center w-full bg-surface-container-low dark:bg-slate-900/80 rounded-xl px-space-md py-1.5 border border-border-subtle dark:border-white/[0.04]">
              <span className="material-symbols-outlined text-on-surface-variant dark:text-text-muted text-[18px] mr-space-sm">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent border-none outline-none font-body-sm text-body-sm text-on-surface dark:text-white placeholder:text-on-surface-variant/70 dark:placeholder:text-text-muted"
                placeholder={t('files.search_placeholder')}
              />
            </div>
          </div>

          <div className="flex items-center gap-space-md self-end lg:self-auto">
            <div className="flex items-center bg-surface-container-low dark:bg-slate-800 p-0.5 rounded-xl border border-border-subtle dark:border-white/[0.04]">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-surface-container-lowest dark:bg-[#121826] text-primary dark:text-indigo-400 shadow-sm' : 'text-on-surface-variant dark:text-text-muted hover:text-on-surface'
                }`}
                title={t('files.view_grid')}
              >
                <span className="material-symbols-outlined text-[18px]">grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                  viewMode === 'table' ? 'bg-surface-container-lowest dark:bg-[#121826] text-primary dark:text-indigo-400 shadow-sm' : 'text-on-surface-variant dark:text-text-muted hover:text-on-surface'
                }`}
                title={t('files.view_table')}
              >
                <span className="material-symbols-outlined text-[18px]">table_rows</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-space-xs overflow-x-auto pb-0.5">
          {(['all', 'docs', 'sheets', 'media', 'archives', 'other'] as FileFilter[]).map((f) => {
            const count = f === 'all' ? files.length : files.filter((x) => x.kind === f).length
            const label = t(`files.filter.${f}`)
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-space-xs px-space-md py-1 rounded-full font-label-md text-label-md transition-all whitespace-nowrap ${
                  filter === f ? 'bg-primary dark:bg-indigo-600 text-white shadow-sm' : 'bg-surface-container-low dark:bg-slate-800 text-on-surface-variant dark:text-text-muted hover:text-on-surface'
                }`}
              >
                <span>{label}</span>
                <span className="font-label-mono text-caption bg-white/20 px-1.5 py-0.2 rounded-full">{count}</span>
              </button>
            )
          })}
        </div>
      </section>

      {error && <div className="px-space-xl py-2 bg-error-container text-on-error-container text-caption">{error}</div>}
      {downloadMessage && (
        <div className="px-space-xl py-2 bg-surface-container-low dark:bg-slate-800 text-on-surface dark:text-white text-caption flex items-center justify-between">
          <span>{downloadMessage}</span>
          <button type="button" onClick={() => setDownloadMessage(null)}>
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Main Content Workspace Split */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-space-md p-space-md overflow-hidden">
        <div className="xl:col-span-8 flex flex-col space-y-space-md overflow-y-auto">
          {filteredFiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-on-surface-variant dark:text-text-muted py-20">
              <span className="material-symbols-outlined text-[36px]">folder_off</span>
              <p className="text-body-sm">
                {loading ? t('files.loading_attachments') : t('files.no_files_criteria')}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-md">
              {filteredFiles.map((file) => {
                const isSelected = file.id === selectedFileId
                const { icon, color } = FILTER_ICON[file.kind]
                return (
                  <div
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className={`p-space-md rounded-xl bg-surface-container-lowest dark:bg-[#121826] border transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between gap-space-sm ${
                      isSelected ? 'border-primary dark:border-indigo-500 ring-1 ring-primary/40' : 'border-border-subtle dark:border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-start gap-space-sm">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                        <span className="material-symbols-outlined text-[24px]">{icon}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-title-sm text-body-sm font-semibold text-on-surface dark:text-white truncate">{file.filename}</h3>
                        <p className="font-caption text-caption text-on-surface-variant dark:text-text-muted truncate">{file.senderName || file.senderEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-caption font-label-mono text-on-surface-variant dark:text-text-muted border-t border-border-subtle dark:border-white/[0.04] pt-2 mt-1">
                      <span>{formatBytes(file.sizeBytes)}</span>
                      <span>{formatDate(file.dateReceived)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border-subtle dark:border-white/[0.06] overflow-hidden">
              <table className="w-full text-body-sm">
                <thead className="bg-surface-container-low dark:bg-slate-800/60 text-caption text-on-surface-variant dark:text-text-muted">
                  <tr>
                    <th className="text-left p-2 font-medium">{t('files.table_file')}</th>
                    <th className="text-left p-2 font-medium">{t('files.table_sender')}</th>
                    <th className="text-left p-2 font-medium">{t('files.table_size')}</th>
                    <th className="text-left p-2 font-medium">{t('files.table_date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr
                      key={file.id}
                      onClick={() => setSelectedFileId(file.id)}
                      className={`cursor-pointer border-t border-border-subtle dark:border-white/[0.04] hover:bg-surface-container-low/60 dark:hover:bg-slate-800/40 ${
                        file.id === selectedFileId ? 'bg-primary/5 dark:bg-indigo-950/30' : ''
                      }`}
                    >
                      <td className="p-2 truncate max-w-[220px] text-on-surface dark:text-white">{file.filename}</td>
                      <td className="p-2 truncate max-w-[180px] text-on-surface-variant dark:text-text-muted">{file.senderName || file.senderEmail}</td>
                      <td className="p-2 font-label-mono text-caption text-on-surface-variant dark:text-text-muted">{formatBytes(file.sizeBytes)}</td>
                      <td className="p-2 font-label-mono text-caption text-on-surface-variant dark:text-text-muted">{formatDate(file.dateReceived)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Section: Selected File Details */}
        <div className="xl:col-span-4 bg-surface-container-lowest dark:bg-[#121826] rounded-2xl p-space-lg shadow-sm border border-border-subtle dark:border-white/[0.06] flex flex-col justify-between overflow-y-auto">
          {activeFile ? (
            <>
              <div className="space-y-space-md">
                <div className="flex flex-col items-center text-center p-space-md bg-surface-container-low/50 dark:bg-slate-900/50 rounded-xl border border-border-subtle dark:border-white/[0.04]">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-space-sm shadow-sm ${FILTER_ICON[activeFile.kind].color}`}>
                    <span className="material-symbols-outlined text-[36px]">{FILTER_ICON[activeFile.kind].icon}</span>
                  </div>
                  <h2 className="font-headline-md text-title-sm font-bold text-on-surface dark:text-white break-all">{activeFile.filename}</h2>
                  <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted mt-1">
                    {formatBytes(activeFile.sizeBytes)} • {activeFile.mimeType}
                  </span>
                </div>

                <div className="space-y-space-sm font-body-sm text-body-sm">
                  <div className="p-space-sm rounded-lg bg-surface-container-low dark:bg-slate-800/40 space-y-1">
                    <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted block uppercase tracking-wider">{t('files.sender_of_attachment')}</span>
                    <span className="font-semibold text-on-surface dark:text-white block">{activeFile.senderName || t('files.sender_no_name')}</span>
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted block">{activeFile.senderEmail}</span>
                  </div>

                  <div className="p-space-sm rounded-lg bg-surface-container-low dark:bg-slate-800/40 space-y-1">
                    <span className="font-caption text-caption text-on-surface-variant dark:text-text-muted block uppercase tracking-wider">{t('files.message_label')}</span>
                    <span className="text-on-surface dark:text-white block truncate">{activeFile.subject || t('reader.no_subject')}</span>
                    <span className="font-label-mono text-caption text-on-surface-variant dark:text-text-muted block">{formatDate(activeFile.dateReceived)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-space-xs pt-space-md">
                <button
                  type="button"
                  onClick={() => handleDownload(activeFile)}
                  disabled={downloading}
                  className="w-full flex items-center justify-center gap-space-sm bg-primary dark:bg-indigo-600 hover:bg-primary-container text-white py-2.5 rounded-xl font-title-sm text-title-sm shadow-md transition-all disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <span>{downloading ? t('files.downloading') : t('files.download')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenThread(activeFile)}
                  className="w-full flex items-center justify-center gap-space-sm bg-surface-container dark:bg-slate-800 hover:bg-surface-container-high text-on-surface dark:text-white py-2 rounded-xl font-title-sm text-caption transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span>{t('files.open_thread')}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant dark:text-text-muted text-body-sm">
              {t('files.select_file_prompt')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
