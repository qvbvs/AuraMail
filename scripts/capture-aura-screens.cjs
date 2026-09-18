const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../out/preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })

    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    await new Promise((r) => setTimeout(r, 2500))

    // 1. Capture current theme (Light or Dark default)
    const img1 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(__dirname, 'screenshot-aura-light.png'), img1.toPNG())
    console.log('Captured screenshot-aura-light.png')

    // 2. Toggle to dark theme
    await win.webContents.executeJavaScript(`
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    `)
    await new Promise((r) => setTimeout(r, 1000))
    const img2 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(__dirname, 'screenshot-aura-dark.png'), img2.toPNG())
    console.log('Captured screenshot-aura-dark.png')

    // 3. Open Command Palette
    await win.webContents.executeJavaScript(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    `)
    await new Promise((r) => setTimeout(r, 800))
    const img3 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(__dirname, 'screenshot-aura-palette.png'), img3.toPNG())
    console.log('Captured screenshot-aura-palette.png')

    // 4. Close command palette and open Compose dialog
    await win.webContents.executeJavaScript(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      }, 300);
    `)
    await new Promise((r) => setTimeout(r, 1000))
    const img4 = await win.webContents.capturePage()
    fs.writeFileSync(path.join(__dirname, 'screenshot-aura-compose.png'), img4.toPNG())
    console.log('Captured screenshot-aura-compose.png')

    console.log('All Aura Mail screenshots captured successfully!')
  } catch (err) {
    console.error('Error during capture:', err)
  } finally {
    app.quit()
  }
})
