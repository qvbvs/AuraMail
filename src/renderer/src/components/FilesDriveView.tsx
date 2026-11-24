import React, { useEffect, useMemo, useState } from 'react'
import { useAccountsStore } from '../state/accounts-store'
import { useMailStore } from '../state/mail-store'
import { useTranslation } from '../i18n'
import type { AttachmentWithMessage } from '@shared/ipc'
import { Button, Icon, IconButton } from './ui/Button'
import { EmptyState } from './ui/EmptyState'

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

const FILTER_ICON: Record<Exclude<FileFilter, 'all'>, string> = {
  docs: 'description',
  sheets: 'table_chart',
  media: 'image',
  archives: 'folder_zip',
  other: 'draft'
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
  const [viewMode, setViewMode] = useState<ViewMode>('table')
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
      <EmptyState
        icon="attach_file"
        title={t('files.no_account')}
        action={
          <Button size="sm" onClick={onBackToMail}>
            {t('files.back_to_mail')}
          </Button>
        }
      />
    )
  }

  const filters: FileFilter[] = ['all', 'docs', 'sheets', 'media', 'archives', 'other']

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-5 pt-3.5 pb-3 border-b border-line flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <IconButton icon="arrow_back" label={t('files.back_to_mail')} onClick={onBackToMail} className="md:hidden" />
          <h1 className="font-bold tracking-[-0.02em] text-xl text-ink">{t('files.title')}</h1>
          <span className="text-xs text-ink-3 tabular-nums">
            {t('files.stats_count', { count: files.length })}, {formatBytes(totalBytes)}
          </span>
          <span className="flex-1" />
          <label className="relative flex items-center w-64 max-sm:w-full">
            <Icon name="search" className="absolute left-2.5 text-ink-3 pointer-events-none" />
            <span className="sr-only">{t('files.search_placeholder')}</span>
            <input type="search" className="input !pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('files.search_placeholder')} />
          </label>
          <IconButton icon="refresh" label={t('files.refresh_tooltip')} loading={loading} onClick={() => activeAccountId && refresh(activeAccountId)} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="segmented" role="group" aria-label={t('files.filter_label')}>
            {filters.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`files.filter.${f}`)}
                <span className="ml-1.5 text-ink-3 tabular-nums">{f === 'all' ? files.length : files.filter((x) => x.kind === f).length}</span>
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <div className="segmented" role="group" aria-label={t('files.view_label')}>
            <button type="button" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')} title={t('files.view_table')} aria-label={t('files.view_table')}>
              <Icon name="table_rows" className="!text-[16px]" />
            </button>
            <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} title={t('files.view_grid')} aria-label={t('files.view_grid')}>
              <Icon name="grid_view" className="!text-[16px]" />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="px-5 py-2 text-xs bg-danger-soft text-danger border-b border-line">
          {error}
        </p>
      )}
      {downloadMessage && (
        <div role="status" className="flex items-center gap-2 px-5 py-2 text-xs text-ink-2 bg-sunken/60 border-b border-line">
          <span className="flex-1 truncate">{downloadMessage}</span>
          <IconButton size="xs" icon="close" label={t('common.close')} onClick={() => setDownloadMessage(null)} />
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto">
          {filteredFiles.length === 0 ? (
            <EmptyState icon={loading ? 'hourglass_empty' : 'folder_off'} title={loading ? t('files.loading_attachments') : t('files.no_files_criteria')} />
          ) : viewMode === 'table' ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel/95 backdrop-blur-[2px] border-b border-line">
                <tr className="text-left text-xs text-ink-3">
                  <th className="font-medium pl-5 pr-2 py-2">{t('files.table_file')}</th>
                  <th className="font-medium px-2 py-2 max-md:hidden">{t('files.table_sender')}</th>
                  <th className="font-medium px-2 py-2 text-right">{t('files.table_size')}</th>
                  <th className="font-medium pl-2 pr-5 py-2 text-right">{t('files.table_date')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => {
                  const selected = file.id === activeFile?.id
                  return (
                    <tr
                      key={file.id}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => setSelectedFileId(file.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleDownload(file)}
                      onDoubleClick={() => handleDownload(file)}
                      className={`border-b border-line cursor-default outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)] ${selected ? 'bg-selected' : 'hover:bg-hover'}`}
                    >
                      <td className="pl-5 pr-2 py-2 max-w-0 w-1/2">
                        <span className="flex items-center gap-2.5">
                          <Icon name={FILTER_ICON[file.kind]} className="text-ink-3" />
                          <span className="truncate text-ink">{file.filename}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 max-w-0 text-ink-2 max-md:hidden">
                        <span className="block truncate">{file.senderName || file.senderEmail}</span>
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-ink-3 tabular-nums whitespace-nowrap">{formatBytes(file.sizeBytes)}</td>
                      <td className="pl-2 pr-5 py-2 text-right text-xs text-ink-3 tabular-nums whitespace-nowrap">{formatDate(file.dateReceived)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-5">
              {filteredFiles.map((file) => {
                const selected = file.id === activeFile?.id
                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedFileId(file.id)}
                      onDoubleClick={() => handleDownload(file)}
                      className={`w-full text-left rounded border bg-raised p-3 ${selected ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line hover:border-line-strong'}`}
                    >
                      <Icon name={FILTER_ICON[file.kind]} className="!text-[24px] text-ink-3" />
                      <span className="block mt-3 truncate text-sm font-medium text-ink">{file.filename}</span>
                      <span className="block truncate text-xs text-ink-3">{file.senderName || file.senderEmail}</span>
                      <span className="flex justify-between mt-2 text-2xs text-ink-3 tabular-nums">
                        <span>{formatBytes(file.sizeBytes)}</span>
                        <span>{formatDate(file.dateReceived)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside className="w-72 flex-shrink-0 border-l border-line overflow-y-auto max-xl:hidden" aria-label={t('files.details_label')}>
          {activeFile ? (
            <div className="p-5 flex flex-col gap-5">
              <div>
                <Icon name={FILTER_ICON[activeFile.kind]} className="!text-[32px] text-ink-3" />
                <h2 className="mt-3 text-md font-medium text-ink break-words">{activeFile.filename}</h2>
                <p className="text-xs text-ink-3 mt-0.5">
                  {formatBytes(activeFile.sizeBytes)}, {activeFile.mimeType}
                </p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="text-ink-3">{t('files.sender_of_attachment')}</dt>
                <dd className="text-ink text-right truncate" title={activeFile.senderEmail}>
                  {activeFile.senderName || activeFile.senderEmail}
                </dd>
                <dt className="text-ink-3">{t('files.message_label')}</dt>
                <dd className="text-ink text-right truncate" title={activeFile.subject}>
                  {activeFile.subject || t('reader.no_subject')}
                </dd>
                <dt className="text-ink-3">{t('files.table_date')}</dt>
                <dd className="text-ink text-right">{formatDate(activeFile.dateReceived)}</dd>
              </dl>
              <div className="flex flex-col gap-2">
                <Button variant="primary" icon="download" loading={downloading} onClick={() => handleDownload(activeFile)}>
                  {t('files.download')}
                </Button>
                <Button icon="forum" onClick={() => handleOpenThread(activeFile)}>
                  {t('files.open_thread')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="p-5 text-sm text-ink-3">{t('files.select_file_prompt')}</p>
          )}
        </aside>
      </div>
    </div>
  )
}
