import { safeStorage } from 'electron'
import keytar from 'keytar'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KEYTAR_SERVICE = 'AuraMail'
const LEGACY_KEYTAR_SERVICE = 'MailApp'

/**
 * Klucz szyfrujący SQLCipher: losowy per-instalacja, trzymany zaszyfrowany
 * przez Electron safeStorage (na Windows oparte o DPAPI) w pliku poza folderem
 * z bazą danych — kradzież samego pliku .db bez dostępu do tego profilu Windows
 * jest bezużyteczna. Nigdy nie loguj tego klucza.
 */
export function getOrCreateDbKey(userDataPath: string): string {
  const keyFilePath = join(userDataPath, 'db.key.enc')

  if (existsSync(keyFilePath)) {
    const encrypted = readFileSync(keyFilePath)
    return safeStorage.decryptString(encrypted)
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage niedostępny — system nie udostępnia bezpiecznego magazynu kluczy.')
  }

  const newKey = randomBytes(32).toString('hex')
  const encrypted = safeStorage.encryptString(newKey)
  writeFileSync(keyFilePath, encrypted)
  return newKey
}

/** Hasło/token konta pocztowego — wyłącznie w Windows Credential Manager, nigdy w SQLite/logach. */
export async function saveAccountSecret(credentialRef: string, secret: string): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, credentialRef, secret)
}

export async function getAccountSecret(credentialRef: string): Promise<string | null> {
  const secret = await keytar.getPassword(KEYTAR_SERVICE, credentialRef)
  if (secret) return secret
  return keytar.getPassword(LEGACY_KEYTAR_SERVICE, credentialRef)
}

export async function deleteAccountSecret(credentialRef: string): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, credentialRef)
  await keytar.deletePassword(LEGACY_KEYTAR_SERVICE, credentialRef).catch(() => {})
}
