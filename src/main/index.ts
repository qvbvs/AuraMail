import { app, BrowserWindow, session, shell, powerMonitor } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray } from './tray'
import { closeDb, getDb } from './database'
import { startScheduler, stopScheduler } from './scheduler'
import { idleManager } from './mail/idle-manager'
import { initMainI18n } from './i18n'
import log from 'electron-log'

// Zabezpieczenie: gdy Electron uruchamiany jest bezpośrednio ze ścieżki do skryptu
// (np. `electron.exe out/main/index.js`, tak jak w testach), nie zawsze poprawnie
// wykrywa nazwę aplikacji z package.json i domyślnie używa "Electron" jako nazwy
// katalogu userData. Jawne app.setName() gwarantuje spójną lokalizację danych.
app.setName('auramail')

log.initialize()

process.on('uncaughtException', (err) => log.error('[uncaughtException]', err))
process.on('unhandledRejection', (err) => log.error('[unhandledRejection]', err))

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    icon,
    webPreferences: {
      // Hardening wg planu (sekcja 8.7) — bez wyjątków, na każdym oknie.
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Synchronizacja stanu zmaksymalizowania oraz fokusu z rendererem dla Caption Buttons i Title Baru
  win.on('maximize', () => {
    win.webContents.send('window:maximize-change', true)
  })
  win.on('unmaximize', () => {
    win.webContents.send('window:maximize-change', false)
  })
  win.on('focus', () => {
    win.webContents.send('window:focus-change', true)
  })
  win.on('blur', () => {
    win.webContents.send('window:focus-change', false)
  })

  win.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    log.info(`[renderer console] ${message} (${sourceId}:${line})`)
  })

  if (is.dev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // Zamknięcie okna minimalizuje do tray zamiast kończyć proces (plan 7.10/7.13) —
  // realne wyjście następuje tylko z menu tray ("Wyjdź") lub app.quit() z app-quit hooka.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  // Blokada nawigacji poza zasoby aplikacji; zewnętrzne linki zawsze w systemowej przeglądarce.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !(is.dev && url.startsWith('http://localhost'))) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// CSP wymuszona w buildzie produkcyjnym z dopuszczeniem fontów i ikon Google
function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;"
        ]
      }
    })
  })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.salanaczas.auramail')
    if (!is.dev) applyContentSecurityPolicy()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    mainWindow = createWindow()
    registerIpcHandlers()
    initMainI18n(getDb())
    createTray(mainWindow)
    startScheduler(getDb())
    idleManager.start(getDb())

    powerMonitor.on('resume', () => {
      log.info('[powerMonitor] powrót z uśpienia — wznawianie IDLE')
      idleManager.reconnectAll()
    })

    powerMonitor.on('unlock-screen', () => {
      idleManager.reconnectAll()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else {
        mainWindow?.show()
      }
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    idleManager.stopAll()
    stopScheduler()
    destroyTray()
    closeDb()
  })

  // Windows/Linux: nie kończ procesu przy zamknięciu ostatniego okna — aplikacja żyje w tray.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // celowo nic — tray utrzymuje proces przy życiu (7.13)
    }
  })
}
