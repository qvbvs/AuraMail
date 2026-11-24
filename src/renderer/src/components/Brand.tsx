import React from 'react'
import logo from '../assets/logo.png'

/** App icon + wordmark, as on the window and taskbar icon. */
export function Brand(): JSX.Element {
  return (
    <span className="flex items-center gap-2 select-none">
      <img src={logo} alt="" width={24} height={24} className="w-6 h-6" draggable={false} />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">AuraMail</span>
    </span>
  )
}
