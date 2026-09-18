import type Database from 'better-sqlite3-multiple-ciphers'
import type { SetMessageFlagsInput } from '@shared/ipc'
import { getAccountConnectionInfo } from './accounts-repository'
import { openImapClient } from './imap-client'
import { getFolderById, recalculateUnreadCount } from './folders-repository'
import {
  getMessageFullRef,
  updateMessageFlags,
  updateMessageLocation,
  deleteMessageRow
} from './messages-repository'

/** Ustawia realne flagi IMAP (\Seen/\Flagged) na serwerze i dopiero po sukcesie
 * aktualizuje lokalną bazę — inaczej kolejny sync nadpisałby zmianę z powrotem
 * (upsertMessageHeader odczytuje flagi z serwera dla istniejących wiadomości). */
export async function setMessageFlags(db: Database.Database, messageId: string, flags: SetMessageFlagsInput): Promise<void> {
  const ref = getMessageFullRef(db, messageId)
  if (!ref) throw new Error('Wiadomość nie istnieje')
  const info = await getAccountConnectionInfo(db, ref.accountId)
  const client = openImapClient(info)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(ref.folderImapPath)
    try {
      if (flags.isRead !== undefined) {
        if (flags.isRead) await client.messageFlagsAdd(String(ref.uid), ['\\Seen'], { uid: true })
        else await client.messageFlagsRemove(String(ref.uid), ['\\Seen'], { uid: true })
      }
      if (flags.isStarred !== undefined) {
        if (flags.isStarred) await client.messageFlagsAdd(String(ref.uid), ['\\Flagged'], { uid: true })
        else await client.messageFlagsRemove(String(ref.uid), ['\\Flagged'], { uid: true })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
  updateMessageFlags(db, messageId, flags)
  recalculateUnreadCount(db, ref.folderId)
}

/** Przenosi wiadomość realnie po IMAP (messageMove) do innego folderu tego samego konta
 * i aktualizuje lokalny wpis (ten sam `id`, żeby nie tracić powiązanych załączników,
 * follow-upów itd. przez ON DELETE CASCADE). */
export async function moveMessage(db: Database.Database, messageId: string, destFolderId: string): Promise<void> {
  const ref = getMessageFullRef(db, messageId)
  if (!ref) throw new Error('Wiadomość nie istnieje')
  const destFolder = getFolderById(db, destFolderId)
  if (!destFolder) throw new Error('Folder docelowy nie istnieje')
  if (destFolder.accountId !== ref.accountId) throw new Error('Nie można przenieść wiadomości między różnymi kontami')

  const info = await getAccountConnectionInfo(db, ref.accountId)
  const client = openImapClient(info)
  await client.connect()
  try {
    let newUid: number | null = null
    const lock = await client.getMailboxLock(ref.folderImapPath)
    try {
      const result = await client.messageMove(String(ref.uid), destFolder.imapPath, { uid: true })
      if (result && result.uidMap) {
        newUid = result.uidMap.get(ref.uid) ?? null
      }
    } finally {
      lock.release()
    }

    if (newUid === null && ref.messageIdHeader) {
      // Serwer nie wspiera UIDPLUS (brak uidMap) — odnajdź realny nowy UID w folderze
      // docelowym po nagłówku Message-ID zamiast zgadywać.
      const destLock = await client.getMailboxLock(destFolder.imapPath)
      try {
        const found = await client.search({ header: { 'message-id': ref.messageIdHeader } }, { uid: true })
        if (found && found.length > 0) newUid = found[found.length - 1]
      } finally {
        destLock.release()
      }
    }

    if (newUid === null) throw new Error('Nie udało się ustalić nowego UID po przeniesieniu wiadomości')

    updateMessageLocation(db, messageId, { folderId: destFolderId, uid: newUid })
  } finally {
    await client.logout().catch(() => {})
  }

  recalculateUnreadCount(db, ref.folderId)
  recalculateUnreadCount(db, destFolderId)
}

/** "Usuń": jeśli wiadomość nie jest w Koszu — realny IMAP move do Kosza (odwracalne,
 * standardowe zachowanie klienta pocztowego). Jeśli już jest w Koszu — trwałe usunięcie
 * (IMAP \Deleted + expunge) i usunięcie lokalnego wiersza. */
export async function deleteMessagePermanently(db: Database.Database, messageId: string): Promise<void> {
  const ref = getMessageFullRef(db, messageId)
  if (!ref) throw new Error('Wiadomość nie istnieje')
  const info = await getAccountConnectionInfo(db, ref.accountId)
  const client = openImapClient(info)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(ref.folderImapPath)
    try {
      await client.messageDelete(String(ref.uid), { uid: true })
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
  deleteMessageRow(db, messageId)
  recalculateUnreadCount(db, ref.folderId)
}
