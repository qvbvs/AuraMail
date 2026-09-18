import { _electron as electron } from 'playwright'
import { join } from 'node:path'

const electronExe = join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
const mainEntry = join(process.cwd(), 'out', 'main', 'index.js')

console.log('Launching Electron app for full 3-pane visual capture...')
const app = await electron.launch({ executablePath: electronExe, args: [mainEntry] })

let win
for (let i = 0; i < 20; i++) {
  const pages = app.windows()
  win = pages.find((p) => !p.url().startsWith('devtools://'))
  if (win) break
  await new Promise((r) => setTimeout(r, 500))
}

if (!win) {
  console.error('No renderer window found!')
  await app.close()
  process.exit(1)
}

await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1500)

// Click on the first account (e.g. Test GreenMail or E2E)
const accountRows = win.locator('aside div[style*="cursor: pointer"]')
const count = await accountRows.count()
console.log(`Found ${count} account/item rows in sidebar`)

// Look for an account row that is not "Wszystkie konta"
const specificAccount = win.locator('aside span:has-text("E2E")').first()
if (await specificAccount.count() > 0) {
  console.log('Clicking account row...')
  await specificAccount.click()
  await win.waitForTimeout(1000)

  // Click on "Odebrane"
  const inboxFolder = win.locator('text=Odebrane').first()
  if (await inboxFolder.count() > 0) {
    console.log('Clicking Odebrane folder...')
    await inboxFolder.click()
    await win.waitForTimeout(1000)

    // Check if there are messages
    const messageRows = win.locator('[data-testid="message-row"]')
    const msgCount = await messageRows.count()
    console.log(`Found ${msgCount} message rows`)
    if (msgCount > 0) {
      await messageRows.first().click()
      await win.waitForTimeout(1000)
    }
  }
}

// 1. Capture current theme full 3-pane layout
await win.screenshot({ path: 'scripts/screenshot-inbox-current.png' })
console.log('Captured screenshot-inbox-current.png')

// 2. Toggle theme and capture other theme
const themeToggle = win.locator('button[title="Przełącz motyw"]')
if (await themeToggle.count() > 0) {
  await themeToggle.click()
  await win.waitForTimeout(600)
  await win.screenshot({ path: 'scripts/screenshot-inbox-toggled.png' })
  console.log('Captured screenshot-inbox-toggled.png')
}

await app.close()
