import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useMailStore } from '../state/mail-store'
import { useAccountsStore } from '../state/accounts-store'
import { useTranslation } from '../i18n'
import type { MessageListItem } from '@shared/ipc'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenCompose: (prefill?: { to?: string; subject?: string }) => void
  onOpenSettings: () => void
  onOpenStats: () => void
}

interface FilterToken {
  id: string
  type: 'from' | 'type' | 'tag'
  label: string
  value: string
}

const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

export function CommandPalette({
  open,
  onClose,
  onOpenCompose,
  onOpenSettings,
  onOpenStats
}: CommandPaletteProps): JSX.Element | null {
  const { t } = useTranslation()
  const { messages, selectMessage, selectFolder, folders, syncNow, searchMailbox } = useMailStore()
  const { accounts, selectedAccountId } = useAccountsStore()
  const activeAccountId = selectedAccountId || accounts[0]?.id || null

  const [query, setQuery] = useState('')
  const [tokens, setTokens] = useState<FilterToken[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<MessageListItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchSeqRef = useRef(0)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSearchResults(null)
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Prawdziwe wyszukiwanie pełnotekstowe po całej skrzynce (FTS5, patrz
  // messages:search) — nie tylko po stronie aktualnie wczytanego folderu. Debounce,
  // żeby nie odpytywać bazy przy każdym naciśnięciu klawisza.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH || !activeAccountId) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++searchSeqRef.current
    const timer = setTimeout(() => {
      searchMailbox(activeAccountId, trimmed)
        .then((results) => {
          if (searchSeqRef.current === seq) {
            setSearchResults(results)
            setSearching(false)
          }
        })
        .catch(() => {
          if (searchSeqRef.current === seq) {
            setSearchResults([])
            setSearching(false)
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, activeAccountId, searchMailbox])

  const isSearchActive = query.trim().length >= MIN_QUERY_LENGTH

  // Filter messages based on query and tokens
  const filteredMessages = useMemo(() => {
    let result = isSearchActive ? searchResults ?? [] : messages

    for (const token of tokens) {
      if (token.type === 'from') {
        const val = token.value.toLowerCase()
        result = result.filter(
          (m) => m.fromName.toLowerCase().includes(val) || m.fromAddr.toLowerCase().includes(val)
        )
      } else if (token.type === 'tag') {
        const val = token.value.toLowerCase()
        result = result.filter(
          (m) => m.subject.toLowerCase().includes(val) || (m.snippet && m.snippet.toLowerCase().includes(val))
        )
      }
    }

    return result.slice(0, 10)
  }, [messages, searchResults, isSearchActive, tokens])

  const selectedMessage: MessageListItem | undefined = filteredMessages[selectedIndex]

  // Keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredMessages.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(0, prev - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedMessage) {
          selectMessage(selectedMessage.id)
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, selectedIndex, filteredMessages, selectedMessage, selectMessage, onClose])

  if (!open) return null

  const removeToken = (id: string): void => {
    setTokens((prev) => prev.filter((t) => t.id !== id))
  }

  const addToken = (token: FilterToken): void => {
    if (!tokens.some((t) => t.id === token.id)) {
      setTokens((prev) => [...prev, token])
    }
  }

  const handleSelectMessage = (msg: MessageListItem): void => {
    selectMessage(msg.id)
    onClose()
  }

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('commandPalette.aria_label')}
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-14 pb-8 px-4"
    >
      {/* Dimmed Overlay Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Main Spotlight Modal Container */}
      <div
        className="relative z-10 w-full max-w-4xl bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Search Input Bar */}
        <div className="p-4 sm:p-5 bg-white dark:bg-[#121826] border-b border-slate-100 dark:border-white/[0.06]">
          <div className="relative flex items-center bg-slate-50 dark:bg-[#182234] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 shadow-inner focus-within:bg-white dark:focus-within:bg-[#151c2b] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <span className="material-symbols-outlined text-primary text-[22px] mr-3 flex-shrink-0">
              search
            </span>

            {/* Tokenized Query Input Container */}
            <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 px-2 py-0.5 rounded-lg text-xs font-medium"
                >
                  <span className="text-[10px] opacity-70 uppercase tracking-wide">{token.type}:</span>
                  <span>{token.label}</span>
                  <button
                    type="button"
                    onClick={() => removeToken(token.id)}
                    className="hover:text-indigo-900 dark:hover:text-white transition-colors flex items-center"
                    title={t('commandPalette.remove_token')}
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                </div>
              ))}

              <input
                ref={inputRef}
                type="text"
                className="flex-1 min-w-[140px] bg-transparent border-none outline-none font-body text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder={tokens.length === 0 ? t('commandPalette.search_placeholder_empty') : t('commandPalette.search_placeholder_tokens')}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
              />
            </div>

            {/* Right-side actions in input */}
            <div className="flex items-center gap-2 pl-2 flex-shrink-0">
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                  title={t('commandPalette.clear_query')}
                >
                  <span className="material-symbols-outlined text-[18px]">backspace</span>
                </button>
              )}
              <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded border border-slate-300/50 dark:border-slate-700/50">
                <span className="text-[10px]">ESC</span>
                <span>{t('commandPalette.esc_close')}</span>
              </div>
            </div>
          </div>

          {/* Quick filter rules row */}
          <div className="flex items-center gap-2 mt-3 pt-1 overflow-x-auto select-none no-scrollbar">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 flex-shrink-0 mr-1">
              {t('commandPalette.filters_label')}
            </span>

            <button
              type="button"
              onClick={() => addToken({ id: 'tag-q3', type: 'tag', label: t('commandPalette.filter_urgent'), value: 'pilne' })}
              className="flex items-center gap-1 bg-slate-100 dark:bg-[#1a2333] hover:bg-slate-200 dark:hover:bg-[#222e42] border border-slate-200 dark:border-white/[0.06] px-2.5 py-1 rounded-full text-xs text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span>{t('commandPalette.filter_urgent')}</span>
            </button>

            <button
              type="button"
              onClick={() => addToken({ id: 'type-pdf', type: 'type', label: t('commandPalette.filter_attachment_pdf'), value: 'pdf' })}
              className="flex items-center gap-1 bg-slate-100 dark:bg-[#1a2333] hover:bg-slate-200 dark:hover:bg-[#222e42] border border-slate-200 dark:border-white/[0.06] px-2.5 py-1 rounded-full text-xs text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-indigo-500">attachment</span>
              <span>{t('commandPalette.filter_with_attachment')}</span>
            </button>

            <button
              type="button"
              onClick={() => addToken({ id: 'from-team', type: 'from', label: t('commandPalette.filter_support_team'), value: 'support' })}
              className="flex items-center gap-1 bg-slate-100 dark:bg-[#1a2333] hover:bg-slate-200 dark:hover:bg-[#222e42] border border-slate-200 dark:border-white/[0.06] px-2.5 py-1 rounded-full text-xs text-slate-700 dark:text-slate-300 transition-colors flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px] text-emerald-500">check_circle</span>
              <span>{t('commandPalette.filter_customer_service')}</span>
            </button>
          </div>
        </div>

        {/* Main Body: Two-Column Split (Results & Live Selected Preview) */}
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[400px] max-h-[500px] overflow-hidden bg-slate-50/50 dark:bg-[#0d131f]/50">
          {/* Left Column: Search Matches & Command Actions (60%) */}
          <div className="md:col-span-7 p-3 sm:p-4 overflow-y-auto space-y-4 border-r border-slate-200/70 dark:border-white/[0.06]">
            {/* Category 1: Messages Matches */}
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                  {isSearchActive ? t('commandPalette.search_results', { count: filteredMessages.length }) : t('commandPalette.recent_messages', { count: filteredMessages.length })}
                </span>
                {searching ? (
                  <span className="text-xs font-mono text-primary font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    {t('commandPalette.searching_full')}
                  </span>
                ) : isSearchActive ? (
                  <span className="text-xs font-mono text-primary font-medium">{t('commandPalette.sort_relevance')}</span>
                ) : null}
              </div>

              {searching && filteredMessages.length === 0 ? (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm">{t('commandPalette.searching')}</div>
              ) : filteredMessages.length === 0 ? (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm">
                  {isSearchActive ? t('commandPalette.no_results_query') : t('commandPalette.no_messages')}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredMessages.map((msg, index) => {
                    const isFocused = index === selectedIndex
                    return (
                      <div
                        key={msg.id}
                        onClick={() => handleSelectMessage(msg)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`group relative p-3 rounded-xl transition-all cursor-pointer ${
                          isFocused
                            ? 'bg-white dark:bg-[#1c2638] shadow-md border-l-4 border-primary dark:border-primary pl-3'
                            : 'hover:bg-white/80 dark:hover:bg-[#161f2e] border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-primary dark:text-indigo-300 font-semibold text-[10px] flex items-center justify-center flex-shrink-0">
                              {msg.fromName ? msg.fromName.charAt(0).toUpperCase() : msg.fromAddr.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                              {msg.fromName || msg.fromAddr}
                            </span>
                            {!msg.isRead && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                              {msg.dateReceived ? new Date(msg.dateReceived).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            {isFocused && (
                              <span className="material-symbols-outlined text-primary text-[15px]">
                                keyboard_return
                              </span>
                            )}
                          </div>
                        </div>

                        <p className={`text-xs mt-1 truncate ${isFocused ? 'text-primary font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                          {msg.subject || t('reader.no_subject')}
                        </p>

                        {msg.snippet && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 leading-relaxed">
                            {msg.snippet}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Category 2: Command Actions & Shortcuts */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/[0.06]">
              <div className="px-2 mb-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                  {t('commandPalette.quick_actions_title')}
                </span>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenCompose()
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white dark:hover:bg-[#1c2638] transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-primary dark:text-indigo-400 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">edit_square</span>
                    </div>
                    <span className="text-xs text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                      {t('commandPalette.compose_new')}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    C
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (activeAccount) syncNow(activeAccount.id)
                    onClose()
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white dark:hover:bg-[#1c2638] transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">sync</span>
                    </div>
                    <span className="text-xs text-slate-700 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {t('commandPalette.sync_now')}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    Sync
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const inbox = folders.find((f) => f.type === 'inbox')
                    if (inbox) selectFolder(inbox.id)
                    onClose()
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white dark:hover:bg-[#1c2638] transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">inbox</span>
                    </div>
                    <span className="text-xs text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                      {t('commandPalette.go_inbox_folder')}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    I
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenStats()
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white dark:hover:bg-[#1c2638] transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">bar_chart</span>
                    </div>
                    <span className="text-xs text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                      {t('commandPalette.show_stats')}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    Stat
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenSettings()
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white dark:hover:bg-[#1c2638] transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">settings</span>
                    </div>
                    <span className="text-xs text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                      {t('commandPalette.settings_integrations')}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    ⌘,
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Instant Live Preview of Selected Match (40%) */}
          <div className="hidden md:flex md:col-span-5 bg-white dark:bg-[#151d2c] p-4 sm:p-5 flex-col justify-between overflow-y-auto">
            {selectedMessage ? (
              <div className="space-y-4">
                {/* Header preview badge */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                  <span className="text-[11px] uppercase tracking-wider text-primary font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">preview</span>
                    <span>{t('commandPalette.quick_preview')}</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    ID: #{selectedMessage.id.slice(-6)}
                  </span>
                </div>

                {/* Sender & Details Card */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#1a2333] border border-slate-100 dark:border-white/[0.04]">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-primary dark:text-indigo-300 font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {selectedMessage.fromName
                      ? selectedMessage.fromName.charAt(0).toUpperCase()
                      : selectedMessage.fromAddr.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">
                        {selectedMessage.fromName || selectedMessage.fromAddr}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {selectedMessage.dateReceived ? new Date(selectedMessage.dateReceived).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {selectedMessage.fromAddr}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{t('commandPalette.tls_encrypted')}</span>
                    </div>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-snug">
                    {selectedMessage.subject || t('reader.no_subject')}
                  </h4>
                </div>

                {/* Snippet body */}
                {selectedMessage.snippet && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed bg-slate-50 dark:bg-[#121824] p-3 rounded-xl border border-slate-100 dark:border-white/[0.04]">
                    <p>{selectedMessage.snippet}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500">
                <span className="material-symbols-outlined text-[36px] mb-2 opacity-60">mail</span>
                <p className="text-xs">{t('commandPalette.select_to_preview')}</p>
              </div>
            )}

            {/* Bottom Action Buttons in Preview Pane */}
            {selectedMessage && (
              <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                <button
                  type="button"
                  onClick={() => handleSelectMessage(selectedMessage)}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2 px-3 rounded-xl shadow-sm hover:bg-primary-container transition-all text-xs font-semibold"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  <span>{t('commandPalette.open_full_thread')}</span>
                  <span className="ml-auto font-mono text-[10px] opacity-80 bg-white/20 px-1 py-0.5 rounded">
                    Enter
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onOpenCompose({
                        to: selectedMessage.fromAddr,
                        subject: t('commandPalette.reply_subject_prefix', { subject: selectedMessage.subject })
                      })
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-medium"
                  >
                    <span className="material-symbols-outlined text-[15px]">reply</span>
                    <span>{t('reader.reply')}</span>
                    <span className="font-mono text-[9px] text-slate-400 ml-1">R</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectMessage(selectedMessage)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-medium"
                  >
                    <span className="material-symbols-outlined text-[15px]">star</span>
                    <span>{t('commandPalette.mark_short')}</span>
                    <span className="font-mono text-[9px] text-slate-400 ml-1">S</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Keyboard Navigation Hints & Search Telemetry */}
        <div className="px-5 py-2.5 bg-slate-100 dark:bg-[#101622] border-t border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                ↑↓
              </span>
              <span>{t('commandPalette.nav_navigate')}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                ↵
              </span>
              <span>{t('commandPalette.nav_select')}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                Esc
              </span>
              <span>{t('commandPalette.nav_exit')}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1 sm:mt-0 text-[11px] opacity-80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{t('commandPalette.db_count', { count: messages.length })}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
