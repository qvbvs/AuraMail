import React from 'react'

/** Wordmark: the raised mailbox flag — the one place the brand yellow appears as a shape. */
export function Brand(): JSX.Element {
  return (
    <span className="flex items-center gap-1.5 select-none">
      <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
        <rect x="2" y="1" width="2.2" height="16" rx="1.1" fill="var(--ink)" />
        <path d="M4.2 2h9.3l-2.6 3.4 2.6 3.4H4.2z" fill="var(--flag)" />
      </svg>
      <span className="text-[16px] font-extrabold tracking-[-0.03em] text-ink">AuraMail</span>
    </span>
  )
}
