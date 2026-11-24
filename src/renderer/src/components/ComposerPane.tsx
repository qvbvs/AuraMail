import React, { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import type { ComposeAttachment, PickedFile } from '@shared/ipc'
import { useAccountsStore } from '../state/accounts-store'
import { useTranslation } from '../i18n'
import { hasPrimaryModifier, hasShortcutOverlay, primaryModifierLabel } from '../utils/keyboard'
import { Button, Icon, IconButton } from './ui/Button'
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Modal } from './ui/Modal'
import { Field } from './ui/Field'
import { RecipientField, isValidEmail, splitAddresses } from './composer/RecipientField'

interface ComposerPaneProps {
  onClose: () => void
  initialTo?: string
  initialSubject?: string
  initialBodyHtml?: string
}

const FOLLOW_UP_HOURS = 72
const ATTACHMENT_HINT = /(w\s+za[łl]\.?|za[łl]ączam|za[łl]ączeni[ue]|w\s+za[łl]ączeniu|attached|please find attached)/i

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readAsPicked(file: File): Promise<PickedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ filename: file.name, mimeType: file.type || 'application/octet-stream', contentBase64: url.slice(url.indexOf(',') + 1), sizeBytes: file.size })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function ToolbarButton({ editor, label, icon, active, onClick }: { editor: Editor | null; label: string; icon: string; active?: boolean; onClick: () => void }): JSX.Element {
  return <IconButton size="sm" icon={icon} label={label} aria-pressed={!!active} disabled={!editor} onClick={onClick} />
}

export function ComposerPane({ onClose, initialTo = '', initialSubject = '', initialBodyHtml = '' }: ComposerPaneProps): JSX.Element {
  const { t, formatDate } = useTranslation()
  const accounts = useAccountsStore((s) => s.accounts)
  const [accountId, setAccountId] = useState('')
  const [to, setTo] = useState<string[]>(() => splitAddresses(initialTo))
  const [cc, setCc] = useState<string[]>([])
  const [bcc, setBcc] = useState<string[]>([])
  const [drafts, setDrafts] = useState({ to: '', cc: '', bcc: '' })
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [attachments, setAttachments] = useState<PickedFile[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnNoAttachment, setWarnNoAttachment] = useState(false)
  const [followUp, setFollowUp] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [, forceToolbarRender] = useState(0)
  const initialBodyRef = useRef<string | null>(null)
  const paneRef = useRef<HTMLElement>(null)

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false, autolink: true }), Underline],
    content: initialBodyHtml || '<p></p>',
    editorProps: { attributes: { 'aria-label': t('composer.body_label'), class: 'mail-body outline-none min-h-[220px]' } },
    onSelectionUpdate: () => forceToolbarRender((n) => n + 1),
    onTransaction: () => forceToolbarRender((n) => n + 1)
  })

  // Prefill can change while the pane stays mounted (e.g. reply to another message).
  useEffect(() => {
    setTo(splitAddresses(initialTo))
    setSubject(initialSubject)
    if (editor) {
      editor.commands.setContent(initialBodyHtml || '<p></p>')
      initialBodyRef.current = editor.getHTML()
      if (initialTo) editor.commands.focus('start')
    }
  }, [initialTo, initialSubject, initialBodyHtml, editor])

  const effectiveAccountId = accountId || accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || ''
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const all = (list: string[], draft: string): string[] => [...list, ...splitAddresses(draft)]
  const finalTo = all(to, drafts.to)
  const finalCc = all(cc, drafts.cc)
  const finalBcc = all(bcc, drafts.bcc)
  const invalid = [...finalTo, ...finalCc, ...finalBcc].filter((a) => !isValidEmail(a))
  const isDirty =
    finalTo.join() !== splitAddresses(initialTo).join() ||
    finalCc.length > 0 ||
    finalBcc.length > 0 ||
    subject !== initialSubject ||
    attachments.length > 0 ||
    (editor != null && initialBodyRef.current !== null && editor.getHTML() !== initialBodyRef.current)

  const validate = (): boolean => {
    if (finalTo.length === 0) {
      setError(t('composer.error_no_recipient'))
      return false
    }
    if (invalid.length) {
      setError(t('composer.error_invalid_recipients', { list: invalid.join(', ') }))
      return false
    }
    return true
  }

  const payload = (): Parameters<typeof window.mailapp.messages.send>[0] => ({
    accountId: effectiveAccountId,
    to: finalTo,
    cc: finalCc,
    bcc: finalBcc,
    subject: subject.trim() || t('reader.no_subject'),
    bodyHtml: editor?.getHTML() ?? '',
    attachments: attachments.map<ComposeAttachment>(({ filename, mimeType, contentBase64 }) => ({ filename, mimeType, contentBase64 })),
    followUpAfterHours: followUp ? FOLLOW_UP_HOURS : undefined
  })

  async function run(action: () => Promise<unknown>): Promise<void> {
    if (!validate()) return
    setSending(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  const send = (): Promise<void> => run(() => window.mailapp.messages.send(payload()))
  const schedule = (sendAt: Date): Promise<void> => run(() => window.mailapp.scheduled.send({ ...payload(), sendAt: sendAt.toISOString(), timezone: timeZone }))

  function handleSend(): void {
    if (sending) return
    if (!warnNoAttachment && attachments.length === 0 && ATTACHMENT_HINT.test(editor?.getText() ?? '')) {
      setWarnNoAttachment(true)
      return
    }
    send()
  }

  const requestClose = (): void => (isDirty ? setConfirmDiscard(true) : onClose())

  const handleComposerKey = useRef<(e: KeyboardEvent) => boolean>(() => false)
  handleComposerKey.current = (e) => {
    if (e.defaultPrevented || e.isComposing || e.repeat || hasShortcutOverlay()) return false
    if (e.key === 'Enter' && hasPrimaryModifier(e) && paneRef.current?.contains(document.activeElement)) {
      e.preventDefault()
      handleSend()
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      requestClose()
      return true
    }
    return false
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { handleComposerKey.current(e) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function pickAttachments(): Promise<void> {
    try {
      const picked = await window.mailapp.files.pickAttachment()
      if (picked?.length) setAttachments((prev) => [...prev, ...picked])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const at = (days: number, hour: number): Date => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const nextMonday = (): Date => at(((1 + 7 - new Date().getDay()) % 7) || 7, 9)
  const scheduleOptions: [string, Date][] = [
    [t('composer.schedule.in_3h'), new Date(Date.now() + 3 * 3600_000)],
    [t('composer.schedule.tomorrow_morning_title'), at(1, 8)],
    [t('composer.schedule.monday_title'), nextMonday()]
  ]

  const openScheduleMenu = (e: React.MouseEvent): void => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({
      x: r.left,
      y: r.top - 8 - 4 * 30,
      items: [
        ...scheduleOptions.map(([label, date], i) => ({
          key: `s${i}`,
          label: `${label}, ${formatDate(date, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`,
          icon: 'schedule_send',
          onSelect: () => schedule(date)
        })),
        { key: 'custom', label: t('composer.schedule.custom_pick'), icon: 'calendar_month', onSelect: () => setCustomOpen(true) }
      ]
    })
  }

  const customDate = customValue ? new Date(customValue) : null
  const customError = customDate && customDate.getTime() <= Date.now() ? t('composer.schedule.past_error') : null

  const applyLink = (): void => {
    const url = linkValue.trim()
    const chain = editor?.chain().focus().extendMarkRange('link')
    if (!url) chain?.unsetLink().run()
    else chain?.setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run()
    setLinkOpen(false)
    setLinkValue('')
  }

  const removeLabel = (a: string): string => t('composer.remove_recipient', { addr: a })

  return (
    <section
      ref={paneRef}
      className="flex-1 min-w-0 h-full flex flex-col relative"
      data-testid="composer-pane"
      aria-label={t('composer.title')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={async (e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setDragOver(false)
        try {
          const files = await Promise.all(Array.from(e.dataTransfer.files).map(readAsPicked))
          setAttachments((prev) => [...prev, ...files])
        } catch (err) {
          setError((err as Error).message)
        }
      }}
    >
      <header className="h-11 flex-shrink-0 flex items-center gap-2 pl-5 pr-2 border-b border-line">
        <h1 className="flex-1 font-bold tracking-[-0.02em] text-lg text-ink truncate">{subject.trim() || t('composer.title')}</h1>
        <IconButton icon="close" label={t('composer.close')} shortcut="Esc" onClick={requestClose} />
      </header>

      {accounts.length > 1 && (
        <div className="flex items-center gap-3 min-h-[40px] px-5 border-b border-line">
          <label htmlFor="composer-from" className="w-14 text-sm text-ink-3">
            {t('composer.from')}
          </label>
          <select id="composer-from" value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)} className="flex-1 h-8 bg-transparent text-sm text-ink outline-none cursor-pointer">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
              </option>
            ))}
          </select>
        </div>
      )}

      <RecipientField
        id="composer-to"
        label={t('composer.to')}
        value={to}
        onChange={setTo}
        draft={drafts.to}
        onDraftChange={(v) => setDrafts((d) => ({ ...d, to: v }))}
        placeholder={t('composer.to_placeholder')}
        removeLabel={removeLabel}
        autoFocus={!initialTo}
        trailing={
          <span className="flex gap-0.5 pt-0.5">
            {!showCc && (
              <Button size="xs" variant="ghost" onClick={() => setShowCc(true)}>
                {t('composer.cc_label')}
              </Button>
            )}
            {!showBcc && (
              <Button size="xs" variant="ghost" onClick={() => setShowBcc(true)}>
                {t('composer.bcc_label')}
              </Button>
            )}
          </span>
        }
      />
      {showCc && (
        <RecipientField id="composer-cc" label={t('composer.cc')} value={cc} onChange={setCc} draft={drafts.cc} onDraftChange={(v) => setDrafts((d) => ({ ...d, cc: v }))} placeholder={t('composer.cc_placeholder')} removeLabel={removeLabel} />
      )}
      {showBcc && (
        <RecipientField id="composer-bcc" label={t('composer.bcc')} value={bcc} onChange={setBcc} draft={drafts.bcc} onDraftChange={(v) => setDrafts((d) => ({ ...d, bcc: v }))} placeholder={t('composer.bcc_placeholder')} removeLabel={removeLabel} />
      )}
      <div className="flex items-center gap-3 min-h-[40px] px-5 border-b border-line">
        <label htmlFor="composer-subject" className="w-14 text-sm text-ink-3">
          {t('composer.subject')}
        </label>
        <input id="composer-subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('composer.subject_placeholder')} className="flex-1 h-8 bg-transparent text-sm font-medium text-ink placeholder:text-ink-3 placeholder:font-normal outline-none" />
      </div>

      <div className="flex items-center gap-0.5 px-3 py-1 border-b border-line flex-wrap" role="toolbar" aria-label={t('composer.toolbar_aria')}>
        <ToolbarButton editor={editor} icon="format_bold" label={t('composer.toolbar.bold')} active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} />
        <ToolbarButton editor={editor} icon="format_italic" label={t('composer.toolbar.italic')} active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <ToolbarButton editor={editor} icon="format_underlined" label={t('composer.toolbar.underline')} active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} />
        <ToolbarButton editor={editor} icon="strikethrough_s" label={t('composer.toolbar.strike')} active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()} />
        <span className="w-px h-4 bg-line mx-1" aria-hidden="true" />
        <ToolbarButton editor={editor} icon="format_list_bulleted" label={t('composer.toolbar.bullet_list')} active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
        <ToolbarButton editor={editor} icon="format_list_numbered" label={t('composer.toolbar.ordered_list')} active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton editor={editor} icon="format_quote" label={t('composer.toolbar.quote')} active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton
          editor={editor}
          icon="link"
          label={t('composer.toolbar.link')}
          active={editor?.isActive('link') || linkOpen}
          onClick={() => {
            setLinkValue(editor?.getAttributes('link').href ?? '')
            setLinkOpen((v) => !v)
          }}
        />
        <ToolbarButton editor={editor} icon="format_clear" label={t('composer.toolbar.clear')} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} />
        <span className="flex-1" />
        <ToolbarButton editor={editor} icon="undo" label={t('composer.toolbar.undo')} onClick={() => editor?.chain().focus().undo().run()} />
        <ToolbarButton editor={editor} icon="redo" label={t('composer.toolbar.redo')} onClick={() => editor?.chain().focus().redo().run()} />
      </div>

      {linkOpen && (
        <form
          className="flex items-center gap-2 px-5 py-2 border-b border-line bg-sunken/60"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <Icon name="link" className="text-ink-3" />
          <label htmlFor="composer-link" className="sr-only">
            {t('composer.toolbar.link_prompt')}
          </label>
          <input id="composer-link" autoFocus className="input !h-7 flex-1" placeholder="https://" value={linkValue} onChange={(e) => setLinkValue(e.target.value)} onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
            e.preventDefault()
            setLinkOpen(false)
            editor?.commands.focus()
          }} />
          <Button size="sm" type="submit" variant="primary">
            {t('common.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      )}

      {warnNoAttachment && (
        <div role="alert" className="flex items-center gap-3 px-5 py-2 border-b border-line bg-warn-soft text-warn text-xs">
          <Icon name="attach_file" className="!text-[16px]" />
          <span className="flex-1">{t('composer.mention_warning.desc')}</span>
          <Button size="xs" variant="secondary" onClick={pickAttachments}>
            {t('composer.attach')}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setWarnNoAttachment(false)
              send()
            }}
          >
            {t('composer.mention_warning.send_anyway')}
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-3 px-5 py-2 border-b border-line bg-danger-soft text-danger text-xs">
          <Icon name="error" className="!text-[16px]" />
          <span className="flex-1">{error}</span>
          <IconButton size="xs" icon="close" label={t('common.close')} onClick={() => setError(null)} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-8 py-5 cursor-text" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus('end')}>
        <EditorContent
          editor={editor}
          className="max-w-[720px]"
          onKeyDownCapture={(e) => {
            if (handleComposerKey.current(e.nativeEvent)) e.stopPropagation()
          }}
        />
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-5 py-3 border-t border-line" aria-label={t('composer.attachments_heading')}>
          {attachments.map((file, idx) => (
            <li key={`${file.filename}-${idx}`} className="h-9 flex items-center gap-2 pl-2.5 pr-1 rounded border border-line bg-raised max-w-[260px]">
              <Icon name="draft" className="text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-ink">{file.filename}</span>
                <span className="block text-2xs text-ink-3">{formatBytes(file.sizeBytes || 0)}</span>
              </span>
              <IconButton size="xs" icon="close" label={t('composer.remove_attachment')} onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))} />
            </li>
          ))}
        </ul>
      )}

      <footer className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-t border-line">
        <div className="inline-flex">
          <Button variant="primary" icon="send" loading={sending} onClick={handleSend} className="rounded-r-none" title={`${t('composer.send')} (${primaryModifierLabel()}+Enter)`}>
            {sending ? t('composer.sending') : t('composer.send')}
          </Button>
          <button
            type="button"
            className="btn btn-primary btn-icon rounded-l-none border-l border-l-[color:var(--accent-hover)]"
            aria-label={t('composer.schedule_send')}
            title={t('composer.schedule_send')}
            disabled={sending}
            onClick={openScheduleMenu}
          >
            <Icon name="expand_less" />
          </button>
        </div>
        <IconButton icon="attach_file" label={t('composer.attach_from_disk')} onClick={pickAttachments} />
        <IconButton icon="text_snippet" label={t('composer.insert_template')} onClick={() => editor?.chain().focus().insertContent(t('composer.template_meeting')).run()} />
        <Button variant="ghost" size="sm" icon="flag" aria-pressed={followUp} onClick={() => setFollowUp((v) => !v)} title={t('composer.followup_tooltip')}>
          <span className="max-sm:sr-only">{t('composer.followup_short')}</span>
        </Button>
        <span className="flex-1" />
        <IconButton icon="delete" label={t('composer.discard')} onClick={requestClose} />
      </footer>

      {dragOver && (
        <div className="absolute inset-2 z-20 rounded-lg border-2 border-dashed border-accent bg-accent-soft/80 flex items-center justify-center pointer-events-none">
          <span className="flex items-center gap-2 text-sm font-medium text-accent-ink">
            <Icon name="upload_file" />
            {t('composer.drop_here')}
          </span>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        size="sm"
        title={t('composer.schedule.custom_title')}
        footer={
          <>
            <Button onClick={() => setCustomOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={!customDate || !!customError}
              onClick={() => {
                if (!customDate) return
                setCustomOpen(false)
                schedule(customDate)
              }}
            >
              {t('composer.schedule.custom_confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('composer.schedule.custom_date')} hint={t('composer.schedule.timezone', { tz: timeZone })} error={customError}>
          {({ id, describedBy, invalid: inv }) => (
            <input id={id} type="datetime-local" className="input" value={customValue} onChange={(e) => setCustomValue(e.target.value)} aria-describedby={describedBy} aria-invalid={inv} />
          )}
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={onClose}
        title={t('composer.discard_title')}
        description={t('composer.discard_desc')}
        confirmLabel={t('composer.discard')}
        danger
      />
    </section>
  )
}
