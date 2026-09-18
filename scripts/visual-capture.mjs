import { _electron as electron } from 'playwright'
import { join } from 'node:path'
import { copyFileSync, existsSync } from 'node:fs'

const electronExe = join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
const mainEntry = join(process.cwd(), 'out', 'main', 'index.js')
const userDataDir = join(process.cwd(), '.tmp-user-data')
const artifactDir = 'C:\\Users\\qvbvs\\.gemini\\antigravity\\brain\\04411b5e-4983-4d55-a1a9-25aff39dcb87'

console.log('Launching Electron app for visual capture...')
const app = await electron.launch({
  executablePath: electronExe,
  args: [mainEntry, `--user-data-dir=${userDataDir}`]
})

let win
for (let i = 0; i < 20; i++) {
  const pages = app.windows()
  win = pages.find((p) => !p.url().startsWith('devtools://'))
  if (win) break
  await new Promise((r) => setTimeout(r, 500))
}

win.on('console', (msg) => console.log('PAGE LOG:', msg.text()))
win.on('pageerror', (err) => console.log('PAGE ERROR:', err))
console.log('WIN URL:', win.url())

await win.waitForLoadState('networkidle').catch(() => {})
await win.waitForTimeout(2000)
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForTimeout(500)

// Helper to save screenshot both in scripts/ and in the artifact directory
async function saveShot(name) {
  const localPath = join(process.cwd(), 'scripts', name)
  await win.screenshot({ path: localPath })
  if (existsSync(artifactDir)) {
    copyFileSync(localPath, join(artifactDir, name))
  }
  console.log(`Saved screenshot: ${name}`)
}

// 1. Inject rich mock data first
console.log('Injecting mock accounts and mail data...')
await win.evaluate(() => {
  if (window.__accountsStore) {
    window.__accountsStore.setState({
      accounts: [
        {
          id: 'acc-1',
          email: 'jan.kowalski@aura-tech.pl',
          displayName: 'Jan Kowalski (Aura Tech)',
          imapHost: 'imap.greenmail.internal',
          imapPort: 993,
          imapSecurity: 'ssl',
          smtpHost: 'smtp.greenmail.internal',
          smtpPort: 587,
          smtpSecurity: 'starttls',
          authType: 'password',
          color: '#4f46e5',
          isDefault: true,
          status: 'active'
        },
        {
          id: 'acc-2',
          email: 'jan.priv@nexus-cyber.io',
          displayName: 'Jan Kowalski (Private/Security)',
          imapHost: 'mail.nexus-cyber.io',
          imapPort: 993,
          imapSecurity: 'ssl',
          smtpHost: 'mail.nexus-cyber.io',
          smtpPort: 465,
          smtpSecurity: 'ssl',
          authType: 'password',
          color: '#06b6d4',
          isDefault: false,
          status: 'active'
        }
      ],
      selectedAccountId: 'acc-1'
    })
  }

  if (window.__mailStore) {
    window.__mailStore.setState({
      folders: [
        { id: 'f-inbox', accountId: 'acc-1', name: 'Odebrane', type: 'inbox', unreadCount: 1, totalCount: 24 },
        { id: 'f-starred', accountId: 'acc-1', name: 'Oznaczone gwiazdką', type: 'custom', unreadCount: 0, totalCount: 5 },
        { id: 'f-sent', accountId: 'acc-1', name: 'Wysłane', type: 'sent', unreadCount: 0, totalCount: 142 },
        { id: 'f-drafts', accountId: 'acc-1', name: 'Wersje robocze', type: 'drafts', unreadCount: 0, totalCount: 2 },
        { id: 'f-archive', accountId: 'acc-1', name: 'Archiwum', type: 'archive', unreadCount: 0, totalCount: 890 },
        { id: 'f-spam', accountId: 'acc-1', name: 'Spam', type: 'spam', unreadCount: 0, totalCount: 12 },
        { id: 'f-trash', accountId: 'acc-1', name: 'Kosz', type: 'trash', unreadCount: 0, totalCount: 4 }
      ],
      selectedFolderId: 'f-inbox',
      messages: [
        {
          id: 'msg-1',
          accountId: 'acc-1',
          folderId: 'f-inbox',
          subject: 'Q3 Product Strategy & AI Integration Roadmap',
          fromAddr: 'elena.rostova@techcorp.io',
          fromName: 'Elena Rostova',
          snippet: 'Cześć Janie, przesyłam podsumowanie ustaleń po wczorajszym spotkaniu strategicznym w sprawie nowej architektury Aura Mail...',
          dateReceived: new Date().toISOString(),
          isRead: false,
          isStarred: true,
          hasAttachments: true,
          labels: ['Priorytet', 'Klienci']
        },
        {
          id: 'msg-2',
          accountId: 'acc-1',
          folderId: 'f-inbox',
          subject: 'Faktura VAT #FV/2026/09/142 - Usługi Cloud & AI',
          fromAddr: 'ksiegowosc@cloudprovider.com',
          fromName: 'Finanse Cloud Services',
          snippet: 'Dzień dobry, w załączeniu przesyłamy fakturę elektroniczną za bieżący okres rozliczeniowy platformy...',
          dateReceived: new Date(Date.now() - 7200000).toISOString(),
          isRead: true,
          isStarred: false,
          hasAttachments: true,
          labels: ['Finanse']
        },
        {
          id: 'msg-3',
          accountId: 'acc-1',
          folderId: 'f-inbox',
          subject: 'Wdrożenie nowego systemu Aura Mail v2.4 zakończone pomyślnie',
          fromAddr: 'marcin.dev@softwarehouse.pl',
          fromName: 'Marcin Nowicki',
          snippet: 'Wszystkie komponenty Tailwind oraz ikony Material Symbols zostały wdrożone zgodnie ze specyfikacją.',
          dateReceived: new Date(Date.now() - 18000000).toISOString(),
          isRead: true,
          isStarred: false,
          hasAttachments: false,
          labels: ['DevOps']
        }
      ],
      selectedMessageId: 'msg-1',
      selectedMessageDetail: {
        id: 'msg-1',
        accountId: 'acc-1',
        folderId: 'f-inbox',
        subject: 'Q3 Product Strategy & AI Integration Roadmap',
        fromAddr: 'elena.rostova@techcorp.io',
        fromName: 'Elena Rostova',
        toAddr: 'jan.kowalski@aura-tech.pl',
        snippet: 'Cześć Janie, przesyłam podsumowanie ustaleń po wczorajszym spotkaniu strategicznym...',
        bodyHtml: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #cbd5e1; padding: 16px;">
            <p>Cześć Janie,</p>
            <p>Przesyłam podsumowanie kluczowych wniosków z wczorajszej sesji architektonicznej <strong>Aura Mail v2.4</strong>:</p>
            <ul style="margin: 12px 0; padding-left: 20px;">
              <li><strong>Nowy Design System:</strong> Spójny z paletą Aura Dark (<code>#0A0E1A</code>) oraz Light (<code>#F8FAFC</code>).</li>
              <li><strong>Architektura Bezpieczeństwa:</strong> Weryfikacja DKIM, SPF oraz TLS 1.3 dla każdego węzła pocztowego.</li>
              <li><strong>Produktywność:</strong> Karta kontaktu Dossier, paleta ⌘K oraz asystent podpowiedzi AI.</li>
            </ul>
            <p>W załącznikach znajdziesz szczegółową specyfikację w formacie PDF oraz diagram architektury.</p>
            <p style="margin-top: 24px;">Pozdrawiam serdecznie,<br><strong>Elena Rostova</strong><br><span style="color: #94a3b8; font-size: 13px;">VP of Engineering @ TechCorp</span></p>
          </div>
        `,
        dateReceived: new Date().toISOString(),
        isRead: false,
        isStarred: true,
        hasAttachments: true,
        attachments: [
          { id: 'att-1', filename: 'Aura_Mail_Roadmap_Q3.pdf', contentType: 'application/pdf', size: 2457600 },
          { id: 'att-2', filename: 'Architecture_Diagram_v2.png', contentType: 'image/png', size: 1048576 }
        ],
        labels: ['Priorytet', 'Klienci']
      }
    })
  }
})

await win.waitForTimeout(1000)

// 2. Capture Dark Mode Mailbox (with Dossier)
await saveShot('screenshot-dark.png')

// 3. Toggle Light Mode and capture
const themeToggle = win.locator('button[title="Przełącz motyw"]')
if (await themeToggle.count() > 0) {
  await themeToggle.click()
  await win.waitForTimeout(600)
  await saveShot('screenshot-light.png')
  // Switch back to dark theme
  await themeToggle.click()
  await win.waitForTimeout(600)
}

// 4. Capture Embedded Composer Pane (NOT A MODAL!)
console.log('Testing Embedded Composer Pane (c key)...')
await win.keyboard.press('c')
await win.waitForTimeout(1000)
await saveShot('screenshot-compose.png')

// Close composer pane via close button
const closeComposeBtn = win.locator('button[title="Zamknij kompozytor (Esc)"]')
if (await closeComposeBtn.count() > 0) {
  await closeComposeBtn.click()
} else {
  await win.keyboard.press('Escape')
}
await win.waitForTimeout(600)

// 5. Navigate to Full-Page Settings View
console.log('Navigating to full-page Settings View...')
const settingsNavBtn = win.locator('button[title="Ustawienia"]')
if (await settingsNavBtn.count() > 0) {
  await settingsNavBtn.click()
} else {
  await win.keyboard.press('Control+,')
}
await win.waitForTimeout(1000)
await saveShot('screenshot-settings.png')

// 6. Navigate to Calendar View via Sidebar
console.log('Navigating to Calendar View...')
const calNavBtn = win.locator('button:has-text("Kalendarz")')
if (await calNavBtn.count() > 0) {
  await calNavBtn.click()
  await win.waitForTimeout(1000)
  await saveShot('screenshot-calendar.png')
}

// 7. Navigate to Files / Drive View via Sidebar
console.log('Navigating to Files/Drive View...')
const filesNavBtn = win.locator('button:has-text("Załączniki i pliki")')
if (await filesNavBtn.count() > 0) {
  await filesNavBtn.click()
  await win.waitForTimeout(1000)
  await saveShot('screenshot-files.png')
}

// 8. Return to Mailbox and navigate to Thread Dossier View
console.log('Navigating to Dedicated Thread Dossier View...')
const openThreadFromDrive = win.locator('button:has-text("Przejdź do wątku wiadomości")').first()
if (await openThreadFromDrive.count() > 0) {
  await openThreadFromDrive.click()
  await win.waitForTimeout(1000)
  await saveShot('screenshot-thread-dossier.png')
  await saveShot('screenshot-thread.png')
  
  // Return to mail via "Wróć do listy wiadomości"
  const backToListBtn = win.locator('button[title="Wróć do listy wiadomości"]').first()
  if (await backToListBtn.count() > 0) {
    await backToListBtn.click()
    await win.waitForTimeout(800)
  }
} else {
  const backToMailBtn = win.locator('button[title="Wróć do poczty"], button:has-text("Poczta")').first()
  if (await backToMailBtn.count() > 0) {
    await backToMailBtn.click()
    await win.waitForTimeout(800)
  }
  const threadViewBtn = win.locator('button[title*="wątku"], button:has-text("Widok wątku")').first()
  if (await threadViewBtn.count() > 0) {
    await threadViewBtn.click()
    await win.waitForTimeout(1000)
    await saveShot('screenshot-thread-dossier.png')
    await saveShot('screenshot-thread.png')
    const backToListBtn = win.locator('button:has-text("Wróć do listy")').first()
    if (await backToListBtn.count() > 0) {
      await backToListBtn.click()
      await win.waitForTimeout(800)
    }
  }
}

// 9. Select Trash Folder and capture 30-day retention banner
console.log('Selecting Trash folder...')
await win.evaluate(() => {
  if (window.__mailStore) {
    const trashFolder = { id: 'f-trash', accountId: 'acc-1', name: 'Kosz', type: 'trash', unreadCount: 0, totalCount: 1 }
    window.__mailStore.setState({
      folders: [
        { id: 'f-inbox', accountId: 'acc-1', name: 'Odebrane', type: 'inbox', unreadCount: 0, totalCount: 10 },
        trashFolder
      ],
      selectedFolderId: 'f-trash',
      messages: [
        {
          id: 'msg-trash-1',
          accountId: 'acc-1',
          folderId: 'f-trash',
          subject: 'Wygasła oferta promocyjna #9812',
          fromAddr: 'newsletter@promo.com',
          fromName: 'Newsletter Promo',
          snippet: 'Twoja subskrypcja testowa wygasa wkrótce...',
          dateReceived: new Date(Date.now() - 86400000).toISOString(),
          isRead: true,
          isStarred: false,
          hasAttachments: false,
          labels: []
        }
      ],
      selectedMessageId: 'msg-trash-1'
    })
  }
})
await win.waitForTimeout(1000)
await saveShot('screenshot-trash.png')

// 10. Open Command Palette and capture
console.log('Opening Command Palette...')
await win.keyboard.press('Control+k')
await win.waitForTimeout(600)
await saveShot('screenshot-command-palette.png')
await win.keyboard.press('Escape')
await win.waitForTimeout(500)

// 11. Open Stats Modal and capture
console.log('Opening Stats Modal...')
const statsBtn = win.locator('button[title="Statystyki skrzynki"]')
if (await statsBtn.count() > 0) {
  await statsBtn.click()
  await win.waitForTimeout(600)
  await saveShot('screenshot-stats.png')
  await win.keyboard.press('Escape')
  await win.waitForTimeout(500)
}

console.log('All visual captures completed successfully!')
await app.close()
