import React from 'react'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  badge?: number | string
  icon?: React.ReactNode
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[]
  activeId: T
  onChange: (id: T) => void
  className?: string
}

export function Tabs<T extends string = string>({
  items,
  activeId,
  onChange,
  className = ''
}: TabsProps<T>): JSX.Element {
  return (
    <div className={`segmented-control ${className}`}>
      {items.map((tab) => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            className={`segmented-button ${isActive ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon && <span style={{ marginRight: 4, display: 'inline-flex', verticalAlign: 'middle' }}>{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined && tab.badge !== null && (
              <span
                style={{
                  marginLeft: 6,
                  padding: '1px 5px',
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 600,
                  backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-canvas)',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)'
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
