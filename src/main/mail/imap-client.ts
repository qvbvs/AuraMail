import { ImapFlow } from 'imapflow'
import type { AccountSecurity } from '@shared/ipc'

export function openImapClient(info: {
  imapHost: string
  imapPort: number
  imapSecurity: AccountSecurity
  email: string
  password: string
}): ImapFlow {
  return new ImapFlow({
    host: info.imapHost,
    port: info.imapPort,
    secure: info.imapSecurity === 'ssl',
    auth: { user: info.email, pass: info.password },
    logger: false
  })
}
