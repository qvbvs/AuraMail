#!/usr/bin/env node
// Zastępuje `electron`'s wbudowany postinstall (który używa `extract-zip`).
// Na tej maszynie `extract-zip`/yauzl po cichu urywa wypakowywanie po pierwszym
// pliku archiwum (0 błędów, exit 0, ale dist/ zawiera tylko jeden plik) — stąd
// AdmZip (czysty JS, synchroniczny) jako niezawodny zamiennik.
import AdmZip from 'adm-zip'
import { downloadArtifact } from '@electron/get'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const electronDir = join(process.cwd(), 'node_modules', 'electron')
const { version } = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8'))
const distDir = join(electronDir, 'dist')
const binaryName = process.platform === 'win32' ? 'electron.exe' : 'electron'

function isInstalled() {
  try {
    const installedVersion = readFileSync(join(distDir, 'version'), 'utf8').replace(/^v/, '')
    return installedVersion === version && existsSync(join(distDir, binaryName))
  } catch {
    return false
  }
}

if (isInstalled()) {
  console.log(`electron ${version} already installed.`)
  process.exit(0)
}

console.log(`Downloading / extracting electron ${version} for ${process.platform}-${process.arch}...`)
const zipPath = await downloadArtifact({
  version,
  artifactName: 'electron',
  platform: process.platform,
  arch: process.arch,
  checksums: JSON.parse(readFileSync(join(electronDir, 'checksums.json'), 'utf8'))
})

rmSync(distDir, { recursive: true, force: true })
new AdmZip(zipPath).extractAllTo(distDir, true)
writeFileSync(join(electronDir, 'path.txt'), binaryName)

if (process.platform !== 'win32') {
  try {
    const { chmodSync } = await import('node:fs')
    const binPath = join(distDir, binaryName)
    if (existsSync(binPath)) chmodSync(binPath, 0o755)
  } catch {}
}

if (!isInstalled()) {
  console.error(`Extraction failed — dist/${binaryName} is still missing.`)
  process.exit(1)
}
console.log('Done.')
