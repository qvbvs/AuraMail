import type { AuraMailApi, MailAppApi } from './index'

declare global {
  interface Window {
    auramail: AuraMailApi
    mailapp: MailAppApi
  }
}
