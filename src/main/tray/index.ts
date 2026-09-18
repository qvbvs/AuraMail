import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { mt, type MainLanguage, setMainLanguage } from '../i18n'

let tray: Tray | null = null
let currentMainWindow: BrowserWindow | null = null

function buildMenu(mainWindow: BrowserWindow): Menu {
  return Menu.buildFromTemplate([
    {
      label: mt('trayOpen'),
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { label: mt('trayCompose'), click: () => mainWindow.webContents.send('tray:compose-new') },
    { label: mt('trayInbox'), click: () => mainWindow.webContents.send('tray:go-inbox') },
    { label: mt('traySearch'), click: () => mainWindow.webContents.send('tray:focus-search') },
    { type: 'separator' },
    { label: mt('traySyncNow'), click: () => mainWindow.webContents.send('tray:sync-now') },
    { label: mt('traySyncPause'), type: 'checkbox', click: (item) => mainWindow.webContents.send('tray:sync-pause', item.checked) },
    { type: 'separator' },
    { label: mt('traySettings'), click: () => mainWindow.webContents.send('tray:open-settings') },
    { type: 'separator' },
    {
      label: mt('trayQuit'),
      click: () => {
        app.exit(0)
      }
    }
  ])
}

export function createTray(mainWindow: BrowserWindow): Tray {
  currentMainWindow = mainWindow
  const iconPath = join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('AuraMail')
  tray.setContextMenu(buildMenu(mainWindow))

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function updateTrayLanguage(lang: MainLanguage): void {
  setMainLanguage(lang)
  if (tray && currentMainWindow && !currentMainWindow.isDestroyed()) {
    tray.setContextMenu(buildMenu(currentMainWindow))
  }
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
  currentMainWindow = null
}
