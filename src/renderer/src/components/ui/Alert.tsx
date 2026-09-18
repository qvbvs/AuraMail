import React from 'react'
import { InfoRegular, WarningRegular, ErrorCircleRegular, CheckmarkCircleRegular, DismissRegular } from '@fluentui/react-icons'
import { useTranslation } from '../../i18n'

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  action?: React.ReactNode
  onDismiss?: () => void
}

export function Alert({
  variant = 'info',
  title,
  action,
  onDismiss,
  children,
  className = '',
  ...props
}: AlertProps): JSX.Element {
  const { t } = useTranslation()
  const icons = {
    info: <InfoRegular fontSize={18} />,
    warning: <WarningRegular fontSize={18} />,
    danger: <ErrorCircleRegular fontSize={18} />,
    success: <CheckmarkCircleRegular fontSize={18} />
  }

  return (
    <div className={`alert alert-${variant} ${className}`} {...props}>
      <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 1 }}>
        {icons[variant]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>}
        <div>{children}</div>
      </div>
      {action && <div style={{ marginLeft: 'var(--space-3)' }}>{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            color: 'inherit',
            opacity: 0.7
          }}
          title={t('common.close')}
        >
          <DismissRegular fontSize={16} />
        </button>
      )}
    </div>
  )
}
