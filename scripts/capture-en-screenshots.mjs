import { _electron as electron } from 'playwright'
import { join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

const electronExe = join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe')
const mainEntry = join(process.cwd(), 'out', 'main', 'index.js')
const userDataDir = join(process.cwd(), '.tmp-user-data-en')

const docsScreenshotDir = join(process.cwd(), 'docs', 'screenshots')
if (!existsSync(docsScreenshotDir)) {
  mkdirSync(docsScreenshotDir, { recursive: true })
}

console.log('Launching Electron app for English visual capture...')
const app = await electron.launch({
  executablePath: electronExe,
  args: [mainEntry, `--user-data-dir=${userDataDir}`]
})

let win
for (let i = 0; i < 25; i++) {
  const pages = app.windows()
  win = pages.find((p) => !p.url().startsWith('devtools://'))
  if (win) break
  await new Promise((r) => setTimeout(r, 500))
}

if (!win) {
  console.error('Renderer window not found!')
  await app.close()
  process.exit(1)
}

win.on('console', (msg) => console.log('PAGE LOG:', msg.text()))
win.on('pageerror', (err) => console.log('PAGE ERROR:', err))

await win.waitForLoadState('networkidle').catch(() => {})
await win.waitForTimeout(1000)
await win.setViewportSize({ width: 1440, height: 900 })

async function saveDocScreenshot(name) {
  const scriptsPath = join(process.cwd(), 'scripts', name)
  const docsPath = join(process.cwd(), 'docs', 'screenshots', name)
  await win.screenshot({ path: scriptsPath })
  copyFileSync(scriptsPath, docsPath)
  console.log(`Successfully generated and saved: docs/screenshots/${name}`)
}

// 1. Configure English language and initial flags
console.log('Setting English locale and initializing state...')
await win.evaluate(() => {
  localStorage.setItem('app_language', 'en')
  localStorage.setItem('onboardingCompleted', 'true')

  if (window.mailapp?.settings?.set) {
    window.mailapp.settings.set('app_language', 'en').catch(() => {})
    window.mailapp.settings.set('onboardingCompleted', 'true').catch(() => {})
  }
})

// Reload window so that LanguageProvider loads with English right from initialization
await win.reload({ waitUntil: 'networkidle' }).catch(() => {})
await win.waitForTimeout(1200)

// 2. Inject English datasets, mock IPC handlers and populate stores
console.log('Injecting professional English mock datasets...')
await win.evaluate(() => {
  if (window.__setLanguage) {
    window.__setLanguage('en')
  }

  if (window.__setShowOnboarding) {
    window.__setShowOnboarding(false)
  }

  const accountId1 = 'a0000000-0000-0000-0000-000000000001'
  const accountId2 = 'b0000000-0000-0000-0000-000000000002'

  if (window.__accountsStore) {
    window.__accountsStore.setState({
      load: async () => {},
      accounts: [
        {
          id: accountId1,
          email: 'alex.morgan@auratech.io',
          displayName: 'Alex Morgan',
          imapHost: 'imap.auratech.io',
          imapPort: 993,
          imapSecurity: 'ssl',
          smtpHost: 'smtp.auratech.io',
          smtpPort: 587,
          smtpSecurity: 'starttls',
          authType: 'password',
          color: '#4f46e5',
          isDefault: true,
          status: 'active'
        },
        {
          id: accountId2,
          email: 'alex.sec@nexus-defense.io',
          displayName: 'Alex Morgan (Security Research)',
          imapHost: 'mail.nexus-defense.io',
          imapPort: 993,
          imapSecurity: 'ssl',
          smtpHost: 'mail.nexus-defense.io',
          smtpPort: 465,
          smtpSecurity: 'ssl',
          authType: 'password',
          color: '#06b6d4',
          isDefault: false,
          status: 'active'
        }
      ],
      selectedAccountId: accountId1
    })
  }

  if (window.__labelsStore) {
    window.__labelsStore.setState({
      labels: [
        { id: 'lbl-priority', name: 'Priority', color: '#6366f1', messageCount: 12 },
        { id: 'lbl-clients', name: 'Clients & Contracts', color: '#38bdf8', messageCount: 5 },
        { id: 'lbl-finance', name: 'Finance & Invoices', color: '#2dd4bf', messageCount: 8 },
        { id: 'lbl-urgent', name: 'Urgent', color: '#f43f5e', messageCount: 2 }
      ],
      selectedLabelId: null
    })
  }

  if (window.__mailStore) {
    window.__mailStore.setState({
      syncError: null,
      error: null,
      syncing: false,
      loadingMessages: false,
      loadingAttachments: false,
      loadFolders: async () => {},
      refreshCurrentFolder: async () => {},
      retryCurrentFolder: async () => {},
      setMessageFlags: async (id, flags) => {
        const prev = window.__mailStore.getState()
        window.__mailStore.setState({
          messages: prev.messages.map((m) => (m.id === id ? { ...m, ...flags } : m)),
          selectedMessageDetail:
            prev.selectedMessageDetail && prev.selectedMessageDetail.id === id
              ? { ...prev.selectedMessageDetail, ...flags }
              : prev.selectedMessageDetail,
          syncError: null
        })
      },
      folders: [
        { id: 'f-inbox', accountId: accountId1, name: 'Inbox', displayName: 'Inbox', type: 'inbox', unreadCount: 1, totalCount: 28 },
        { id: 'f-starred', accountId: accountId1, name: 'Starred', displayName: 'Starred', type: 'custom', unreadCount: 0, totalCount: 5 },
        { id: 'f-sent', accountId: accountId1, name: 'Sent', displayName: 'Sent', type: 'sent', unreadCount: 0, totalCount: 142 },
        { id: 'f-drafts', accountId: accountId1, name: 'Drafts', displayName: 'Drafts', type: 'drafts', unreadCount: 0, totalCount: 2 },
        { id: 'f-archive', accountId: accountId1, name: 'Archive', displayName: 'Archive', type: 'archive', unreadCount: 0, totalCount: 890 },
        { id: 'f-spam', accountId: accountId1, name: 'Spam', displayName: 'Spam', type: 'spam', unreadCount: 0, totalCount: 12 },
        { id: 'f-trash', accountId: accountId1, name: 'Trash', displayName: 'Trash', type: 'trash', unreadCount: 0, totalCount: 4 }
      ],
      selectedFolderId: 'f-inbox',
      selectedLabelId: null,
      isUnifiedInbox: false,
      messages: [
        {
          id: 'msg-1',
          accountId: accountId1,
          folderId: 'f-inbox',
          subject: 'Q3 Distributed Sync Engine & Security Architecture Roadmap',
          fromAddr: 'elena.rostova@techcorp.io',
          fromName: 'Elena Rostova',
          snippet: "Hi Alex, I've consolidated the technical findings from yesterday's architecture review regarding the new AuraMail engine...",
          dateReceived: new Date().toISOString(),
          isRead: true,
          isStarred: true,
          hasAttachments: true,
          labels: [
            { id: 'lbl-priority', name: 'Priority', color: '#6366f1' },
            { id: 'lbl-clients', name: 'Clients & Contracts', color: '#38bdf8' }
          ]
        },
        {
          id: 'msg-2',
          accountId: accountId1,
          folderId: 'f-inbox',
          subject: 'Stripe Invoice #INV-2026-091 - Cloud Infrastructure & AI Workloads',
          fromAddr: 'billing@stripe.com',
          fromName: 'Stripe Invoicing',
          snippet: 'Your monthly statement for dedicated high-performance compute clusters and database encryption storage has been processed...',
          dateReceived: new Date(Date.now() - 7200000).toISOString(),
          isRead: true,
          isStarred: false,
          hasAttachments: true,
          labels: [
            { id: 'lbl-finance', name: 'Finance & Invoices', color: '#2dd4bf' }
          ]
        },
        {
          id: 'msg-3',
          accountId: accountId1,
          folderId: 'f-inbox',
          subject: 'Security Audit Completed: Zero Critical Vulnerabilities Found',
          fromAddr: 'd.vance@security-audit.io',
          fromName: 'David Vance',
          snippet: 'All penetration tests for DPAPI encryption, SQLCipher key derivation, and IPC boundary isolation have passed with distinction.',
          dateReceived: new Date(Date.now() - 18000000).toISOString(),
          isRead: false,
          isStarred: false,
          hasAttachments: false,
          labels: [
            { id: 'lbl-urgent', name: 'Urgent', color: '#f43f5e' }
          ]
        }
      ],
      selectedMessageId: 'msg-1',
      selectedMessageDetail: {
        id: 'msg-1',
        accountId: accountId1,
        folderId: 'f-inbox',
        subject: 'Q3 Distributed Sync Engine & Security Architecture Roadmap',
        fromAddr: 'elena.rostova@techcorp.io',
        fromName: 'Elena Rostova',
        toAddr: 'alex.morgan@auratech.io',
        snippet: "Hi Alex, I've consolidated the technical findings from yesterday's architecture review...",
        bodyHtml: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #cbd5e1; padding: 18px;">
            <p style="font-size: 15px; margin-bottom: 14px;">Hi Alex,</p>
            <p style="font-size: 14px; margin-bottom: 14px;">Here is the executive technical summary from our <strong>AuraMail v2.4 Architecture Review</strong> session:</p>
            <ul style="margin: 14px 0; padding-left: 24px; font-size: 14px; space-y: 6px;">
              <li><strong>Modern Design System:</strong> Clean Fluent & Tailwind tokens with Aura Dark (<code>#0A0E1A</code>) and Light (<code>#F8FAFC</code>) palettes.</li>
              <li><strong>Zero-Trust Security Model:</strong> AES-256 SQLCipher disk encryption with DPAPI-protected keys and Windows Credential Manager integration.</li>
              <li><strong>Live IMAP Push:</strong> Persistent IMAP IDLE connection with exponential reconnect backoff and instant power wake-up recovery.</li>
              <li><strong>Pro Productivity:</strong> Contact Dossier, global ⌘K command palette, and Tiptap rich composer with template support.</li>
            </ul>
            <p style="font-size: 14px; margin-top: 14px;">The detailed technical specification and architecture topology diagrams are attached below.</p>
            <p style="margin-top: 26px; font-size: 14px;">Best regards,<br><strong style="color: #f1f5f9;">Elena Rostova</strong><br><span style="color: #94a3b8; font-size: 13px;">VP of Engineering @ TechCorp Systems</span></p>
          </div>
        `,
        dateReceived: new Date().toISOString(),
        isRead: true,
        isStarred: true,
        hasAttachments: true,
        attachments: [
          { id: 'att-1', filename: 'AuraMail_Architecture_Roadmap_Q3.pdf', contentType: 'application/pdf', size: 2457600 },
          { id: 'att-2', filename: 'Distributed_Topology_v2.png', contentType: 'image/png', size: 1048576 }
        ],
        labels: [
          { id: 'lbl-priority', name: 'Priority', color: '#6366f1' },
          { id: 'lbl-clients', name: 'Clients & Contracts', color: '#38bdf8' }
        ]
      },
      selectedMessageAttachments: [
        { id: 'att-1', filename: 'AuraMail_Architecture_Roadmap_Q3.pdf', contentType: 'application/pdf', size: 2457600 },
        { id: 'att-2', filename: 'Distributed_Topology_v2.png', contentType: 'image/png', size: 1048576 }
      ]
    })
  }

  if (window.__setCurrentView) {
    window.__setCurrentView('mail')
  }
  if (window.__setIsComposing) {
    window.__setIsComposing(false)
  }
})

// Give UI a moment to re-render cleanly
await win.waitForTimeout(1500)

// 3. Capture Dark Mode Mailbox (screenshot-dark.png)
console.log('Capturing screenshot-dark.png...')
await saveDocScreenshot('screenshot-dark.png')

// 4. Toggle Light Mode and capture (screenshot-light.png)
console.log('Capturing screenshot-light.png...')
const themeToggle = win.locator('[data-testid="theme-toggle"]')
if (await themeToggle.count() > 0) {
  await themeToggle.click()
  await win.waitForTimeout(1000)
  await saveDocScreenshot('screenshot-light.png')
  // Switch back to dark theme
  await themeToggle.click()
  await win.waitForTimeout(1000)
}

// 5. Open and capture Embedded Composer Pane (screenshot-compose.png)
console.log('Opening and capturing screenshot-compose.png...')
await win.evaluate(() => {
  if (window.__setComposePrefill) {
    window.__setComposePrefill({
      to: 'elena.rostova@techcorp.io',
      subject: 'Re: Q3 Distributed Sync Engine Architecture RFC',
      bodyHtml: '<p>Hi Elena,</p><p>Thank you for the detailed architecture report. The team has reviewed the proposed gRPC and SQLite synchronization primitives. We agree with the direction and would like to schedule a deep dive on Thursday.</p><p>Regards,<br><strong>Alex Morgan</strong></p>'
    })
  }
  if (window.__setIsComposing) {
    window.__setIsComposing(true)
  }
})
await win.waitForTimeout(1200)
await saveDocScreenshot('screenshot-compose.png')

// Close composer
await win.evaluate(() => {
  if (window.__setIsComposing) {
    window.__setIsComposing(false)
  }
})
await win.waitForTimeout(600)

// 6. Navigate to Calendar View (screenshot-calendar.png)
console.log('Navigating to Calendar View and injecting English events...')
await win.evaluate(() => {
  if (window.__setCurrentView) {
    window.__setCurrentView('calendar')
  }

  if (window.__calendarStore) {
    window.__calendarStore.setState({
      load: async () => {},
      error: null,
      loading: false,
      events: [
        {
          id: 'ev-1',
          title: 'Q3 Sprint Planning & Architecture Review',
          description: 'Bi-weekly architecture sync for core platform.',
          startTz: '2026-09-18T09:00:00.000Z',
          endTz: '2026-09-18T10:30:00.000Z',
          allDay: false,
          color: '#4f46e5'
        },
        {
          id: 'ev-2',
          title: 'Security Audit Debrief w/ David Vance',
          description: 'Discussion of penetration testing results.',
          startTz: '2026-09-18T14:00:00.000Z',
          endTz: '2026-09-18T15:00:00.000Z',
          allDay: false,
          color: '#f43f5e'
        },
        {
          id: 'ev-3',
          title: 'Cloud Infrastructure Optimization Sync',
          description: 'Reviewing compute cluster costs and latency.',
          startTz: '2026-09-15T10:00:00.000Z',
          endTz: '2026-09-15T11:30:00.000Z',
          allDay: false,
          color: '#2dd4bf'
        },
        {
          id: 'ev-4',
          title: '1:1 Sync with Elena Rostova',
          description: 'Performance review and engineering objectives.',
          startTz: '2026-09-16T13:00:00.000Z',
          endTz: '2026-09-16T14:00:00.000Z',
          allDay: false,
          color: '#38bdf8'
        },
        {
          id: 'ev-5',
          title: 'Sprint Retrospective & Demo',
          description: 'Presentation of v2.4 features to team.',
          startTz: '2026-09-22T09:00:00.000Z',
          endTz: '2026-09-22T10:00:00.000Z',
          allDay: false,
          color: '#8b5cf6'
        },
        {
          id: 'ev-6',
          title: 'Executive Board Presentation',
          description: 'Quarterly roadmap presentation.',
          startTz: '2026-09-24T15:00:00.000Z',
          endTz: '2026-09-24T16:30:00.000Z',
          allDay: false,
          color: '#d97706'
        }
      ]
    })
  }
})
await win.waitForTimeout(1400)
await saveDocScreenshot('screenshot-calendar.png')

// 7. Navigate to Thread Dossier View (screenshot-thread.png)
console.log('Navigating to Thread Dossier View in English...')
await win.evaluate(() => {
  if (window.__setCurrentView) {
    window.__setCurrentView('thread-dossier')
  }
})
await win.waitForTimeout(1400)
await saveDocScreenshot('screenshot-thread.png')

console.log('All English screenshots captured and placed into docs/screenshots/ successfully!')
await app.close()
