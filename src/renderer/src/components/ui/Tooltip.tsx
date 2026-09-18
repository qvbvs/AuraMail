import React, { useState } from 'react'

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({
  content,
  children,
  position = 'top'
}: TooltipProps): JSX.Element {
  const [visible, setVisible] = useState(false)

  const positions: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-6px)' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%) translateY(6px)' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-6px)' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%) translateX(6px)' }
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          style={{
            position: 'absolute',
            zIndex: 'var(--z-tooltip)',
            backgroundColor: 'var(--text-primary)',
            color: 'var(--text-inverse)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-medium)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-md)',
            animation: 'fadeIn 100ms ease-out',
            ...positions[position]
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
}
