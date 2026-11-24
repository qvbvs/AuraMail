import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { setTrayUpdateAction } from '../tray'
import { startAppUpdater } from './app-updater'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: Object.assign(new EventEmitter(), { isPackaged: true }),
    Notification: { isSupported: () => false }
  }
})

vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    autoUpdater: Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn(),
      quitAndInstall: vi.fn()
    })
  }
})

vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))
vi.mock('../tray', () => ({ setTrayUpdateAction: vi.fn() }))

const checkForUpdates = vi.mocked(autoUpdater.checkForUpdates)
const interval = 15 * 60 * 1000
const updateInfo = { version: '0.4.0', files: [], releaseDate: '', path: '', sha512: '' }

describe('app updater', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.assign(app, { isPackaged: true })
    checkForUpdates.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    app.emit('will-quit')
    autoUpdater.removeAllListeners()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('skips development builds', async () => {
    Object.assign(app, { isPackaged: false })
    startAppUpdater()
    await vi.advanceTimersByTimeAsync(interval)
    expect(checkForUpdates).not.toHaveBeenCalled()
  })

  it('checks on startup, waits for the download, and retries after a failure', async () => {
    let failDownload!: (error: Error) => void
    const downloadPromise = new Promise<string[]>((_, reject) => {
      failDownload = reject
    })
    checkForUpdates.mockResolvedValueOnce({ isUpdateAvailable: true, versionInfo: updateInfo, updateInfo, downloadPromise })

    startAppUpdater()
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(interval)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    failDownload(new Error('Connection lost'))
    await vi.advanceTimersByTimeAsync(interval)
    expect(checkForUpdates).toHaveBeenCalledTimes(2)

    app.emit('will-quit')
    await vi.advanceTimersByTimeAsync(interval)
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('downloads stable releases and offers restart only after a download', () => {
    startAppUpdater()
    expect(autoUpdater.allowPrerelease).toBe(false)
    expect(autoUpdater.autoDownload).toBe(true)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true)
    const download = { ...updateInfo, downloadedFile: 'auramail-0.4.0-setup.exe' }
    autoUpdater.emit('update-available', updateInfo)
    expect(setTrayUpdateAction).not.toHaveBeenCalled()
    autoUpdater.emit('update-downloaded', download)
    autoUpdater.emit('update-downloaded', download)
    expect(setTrayUpdateAction).toHaveBeenCalledTimes(1)
    vi.mocked(setTrayUpdateAction).mock.calls[0][0]?.()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
    autoUpdater.emit('update-available', { ...updateInfo, version: '0.5.0' })
    expect(setTrayUpdateAction).toHaveBeenLastCalledWith(null)
  })
})
