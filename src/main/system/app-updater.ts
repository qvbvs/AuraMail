import { app, Notification } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'
import { mt } from '../i18n'
import { setTrayUpdateAction } from '../tray'

const CHECK_INTERVAL_MS = 15 * 60 * 1000

export function startAppUpdater(): void {
  if (!app.isPackaged || (process.platform !== 'win32' && process.platform !== 'linux')) return

  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.disableWebInstaller = true

  let readyVersion: string | undefined
  autoUpdater.on('error', (error) => log.warn('[updates]', error))
  autoUpdater.on('update-available', ({ version }) => {
    if (readyVersion && readyVersion !== version) {
      readyVersion = undefined
      setTrayUpdateAction(null)
    }
  })
  autoUpdater.on('update-downloaded', ({ version }) => {
    if (readyVersion === version) return
    readyVersion = version
    setTrayUpdateAction(() => autoUpdater.quitAndInstall(true, true))

    if (Notification.isSupported()) {
      new Notification({
        title: mt('notifyUpdateTitle', { version }),
        body: mt('notifyUpdateBody')
      }).show()
    }
  })

  let checking = false
  async function check(): Promise<void> {
    if (checking) return
    checking = true
    try {
      const update = await autoUpdater.checkForUpdates()
      await update?.downloadPromise
    } catch {
      // The updater emits an error event for both check and download failures.
    } finally {
      checking = false
    }
  }

  void check()
  const timer = setInterval(() => void check(), CHECK_INTERVAL_MS)
  app.once('will-quit', () => clearInterval(timer))
}
