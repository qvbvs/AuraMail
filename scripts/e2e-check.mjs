#!/usr/bin/env node
// Jednorazowa weryfikacja end-to-end przeciw lokalnemu serwerowi GreenMail
// (docker: greenmail-test, IMAP :3143 / SMTP :3025, testuser@localhost / testpass, bez TLS).
// Nie jest to część stałego zestawu testów — ad-hoc dowód, że warstwa IMAP/SMTP
// faktycznie działa (dodanie konta -> sync -> wysyłka -> ponowny sync widzi nową wiadomość).
import { _electron as electron } from 'playwright'
import { join } from 'node:path'

const electronExe = join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
const mainEntry = join(process.cwd(), 'out', 'main', 'index.js')

function log(step, ok, extra = '') {
  console.log(`${ok ? '✓' : '✗'} ${step}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const app = await electron.launch({ executablePath: electronExe, args: [mainEntry] })

// is.dev (z @electron-toolkit/utils) == !app.isPackaged, więc uruchomione poza
// electron-builderem zawsze otwiera DevTools w osobnym oknie — trzeba je odróżnić
// od właściwego okna renderera po URL, bo Playwright's firstWindow() bywa losowe.
let win
for (let i = 0; i < 20; i++) {
  const pages = app.windows()
  win = pages.find((p) => !p.url().startsWith('devtools://'))
  if (win) break
  await new Promise((r) => setTimeout(r, 500))
}
if (!win) throw new Error('Nie znaleziono okna renderera (tylko DevTools?)')
win.on('console', (msg) => console.log('PAGE LOG:', msg.text()))
win.on('pageerror', (err) => console.log('PAGE ERROR:', err))
await win.waitForLoadState('domcontentloaded')

// GreenMail (auth.disabled) akceptuje dowolny login i tworzy skrzynkę dynamicznie —
// unikalny adres per uruchomienie, żeby nie trzeba było czyścić userData między testami.
const runId = Date.now()
const testEmail = `e2e-${runId}@localhost`
const displayName = `E2E ${runId}`

try {
  // --- Dodanie konta ---
  await win.getByTitle('Dodaj nowe konto').click()
  await win.waitForTimeout(500)
  await win.getByLabel('Adres e-mail').fill(testEmail)
  await win.getByLabel('Nazwa wyświetlana').fill(displayName)
  await win.getByLabel('Hasło').fill('testpass')
  await win.getByLabel('Serwer IMAP').fill('localhost')
  await win.getByLabel('Port IMAP').fill('3143')
  await win.getByLabel('Zabezpieczenie IMAP').selectOption('none')
  await win.getByLabel('Serwer SMTP').fill('localhost')
  await win.getByLabel('Port SMTP').fill('3025')
  await win.getByLabel('Zabezpieczenie SMTP').selectOption('none')

  await win.getByRole('button', { name: 'Testuj połączenie' }).click()
  await win.waitForTimeout(2000)
  const stepsText = (await win.locator('ul').allInnerTexts()).join(' | ')
  const testConnectionOk = stepsText.includes('Uwierzytelnienie powiodło się') && !stepsText.includes('✗')
  log('Test połączenia IMAP+SMTP wykonany', testConnectionOk, stepsText)

  await win.getByRole('button', { name: 'Dodaj konto' }).click()
  await win.waitForTimeout(1000)
  await win.screenshot({ path: 'scripts/e2e-after-submit.png' }).catch(() => {})
  log('Dialog dodawania konta zamknięty po submit', (await win.locator('text=Dodaj konto pocztowe').count()) === 0)

  // --- Czekamy na auto-sync po dodaniu konta ---
  await win.waitForTimeout(4000)
  const accountRow = win.locator(`text=${displayName}`)
  log('Konto widoczne w sidebarze', (await accountRow.count()) > 0)
  await accountRow.first().click()
  await win.waitForTimeout(3000)

  const inboxFolder = win.locator('text=Odebrane')
  log('Folder Odebrane pojawił się po sync', (await inboxFolder.count()) > 0)

  // --- Wysyłka wiadomości do samego siebie ---
  await win.getByRole('button', { name: 'Nowa wiadomość' }).click()
  await win.waitForTimeout(500)
  await win.screenshot({ path: 'scripts/e2e-compose-open.png' }).catch(() => {})
  await win.locator('input[placeholder*="jan@example.com"]').fill(testEmail)
  await win.getByLabel('Temat').fill('E2E test message')
  const editor = win.locator('.ProseMirror')
  await editor.click()
  await editor.type('To jest testowa wiadomosc z automatycznego sprawdzenia end-to-end.')

  await win.getByRole('button', { name: 'Wyślij' }).first().click()
  await win.waitForTimeout(3000)
  const composeStillOpen = await win.getByRole('heading', { name: 'Nowa wiadomość' }).isVisible().catch(() => false)
  log('Dialog kompozytora zamknięty po wysyłce', !composeStillOpen)

  // --- Ponowna synchronizacja: nowa wiadomość powinna się pojawić ---
  await win.getByTitle('Synchronizuj teraz').click()
  await win.waitForTimeout(4000)

  const sentSubject = win.locator('text=E2E test message')
  log('Wysłana wiadomość pojawiła się w Inbox po ponownym sync', (await sentSubject.count()) > 0)

  // --- Scheduler: zaplanuj wysyłkę za ~10s przez "Wybierz datę i godzinę" ---
  await win.getByRole('button', { name: 'Nowa wiadomość' }).click()
  await win.waitForTimeout(500)
  await win.locator('input[placeholder*="jan@example.com"]').fill(testEmail)
  await win.getByLabel('Temat').fill('E2E scheduled message')
  await win.locator('.ProseMirror').click()
  await win.locator('.ProseMirror').type('Zaplanowana wiadomosc testowa.')

  const dialogActionsButtons = win.locator('.fui-DialogActions button, [class*="DialogActions"] button')
  const btnCount = await dialogActionsButtons.count()
  log('SplitButton renderuje 2 przyciski (akcja + menu)', btnCount >= 2, `count=${btnCount}`)
  await dialogActionsButtons.nth(btnCount - 1).click() // chevron/menu trigger
  await win.waitForTimeout(300)
  await win.getByRole('menuitem', { name: 'Wybierz datę i godzinę...' }).click()
  await win.waitForTimeout(300)

  const soon = new Date(Date.now() + 10_000)
  const pad = (n) => String(n).padStart(2, '0')
  const localValue = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`
  await win.locator('input[type="datetime-local"]').fill(localValue)
  await win.getByRole('button', { name: 'Zaplanuj' }).click()
  await win.waitForTimeout(1500)
  const composeClosedAfterSchedule = !(await win.getByRole('heading', { name: 'Nowa wiadomość' }).isVisible().catch(() => false))
  log('Dialog kompozytora zamknięty po zaplanowaniu', composeClosedAfterSchedule)

  await win.locator('text=Zaplanowane').click()
  await win.waitForTimeout(500)
  await win.screenshot({ path: 'scripts/e2e-scheduled-view.png' }).catch(() => {})
  log('Zaplanowana wiadomość widoczna na liście "Zaplanowane"', (await win.locator('text=E2E scheduled message').count()) > 0)

  // Scheduler tick co 30s — czekamy aż wyśle (do 40s), potem sprawdzamy że zniknęła z listy.
  await win.waitForTimeout(40_000)
  await win.locator('text=Zaplanowane').click()
  await win.waitForTimeout(500)
  const stillPending = await win.locator('text=E2E scheduled message').count()
  log('Zaplanowana wiadomość wysłana (zniknęła z listy pending)', stillPending === 0)

  await accountRow.first().click()
  await win.waitForTimeout(500)
  await win.locator('text=Odebrane').click()
  await win.getByTitle('Synchronizuj teraz').click()
  await win.waitForTimeout(4000)
  log('Zaplanowana wiadomość dotarła do Inbox', (await win.locator('text=E2E scheduled message').count()) > 0)

  // --- Snooze: uśpij pierwszą wiadomość z listy, sprawdź że znika i trafia do "Uśpione" ---
  const firstRow = win.locator('[data-testid="message-row"]', { hasText: 'E2E scheduled message' })
  const snoozedSubject = 'E2E scheduled message'
  await firstRow.locator('summary').click()
  await win.waitForTimeout(300)
  await win.getByRole('button', { name: 'Za godzinę' }).click()
  await win.waitForTimeout(1000)
  const stillInInbox = snoozedSubject ? await win.locator(`text=${snoozedSubject}`).count() : -1
  log('Wiadomość zniknęła z Inbox po uśpieniu', stillInInbox === 0, `subject=${snoozedSubject}`)

  await win.locator('text=Uśpione').click()
  await win.waitForTimeout(500)
  log('Uśpiona wiadomość widoczna na liście "Uśpione"', snoozedSubject ? (await win.locator(`text=${snoozedSubject}`).count()) > 0 : false)
} catch (err) {
  console.error('BŁĄD podczas testu:', err)
  process.exitCode = 1
} finally {
  await win.screenshot({ path: 'scripts/e2e-final-state.png' }).catch(() => {})
  await app.close()
}
