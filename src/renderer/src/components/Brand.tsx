import React from 'react'
import logo from '../assets/logo.png'

/** App icon + wordmark, as on the window and taskbar icon. */
export function Brand(): JSX.Element {
  return (
    <span className="flex items-center gap-2 select-none">
      <img src={logo} alt="" width={22} height={22} className="w-[22px] h-[22px]" draggable={false} />
      <span className="text-[16px] font-extrabold tracking-[-0.03em] text-ink">AuraMail</span>
    </span>
  )
}
