#!/usr/bin/env node
// Kompiluje natywne moduły (better-sqlite3-multiple-ciphers, keytar) na Windows z Node 24.
//
// Powód istnienia tego skryptu: oficjalny build Node.js 24 dla Windows jest kompilowany
// Clangiem (process.config.variables.clang === 1), więc node-gyp generuje projekty MSBuild
// pod toolset ClangCL. Jednocześnie Node 24 ma włączone node_with_ltcg=true, co node-gyp's
// addon.gypi tłumaczy na WholeProgramOptimization + flagę /LTCG:INCREMENTAL dla librariana —
// flagę, której llvm-lib.exe (librarian dostarczany z ClangCL) nie obsługuje, przez co link
// się wywala (MSB6006 / "no such file or directory" na /LTCG:INCREMENTAL).
//
// To niedopasowanie leży w node-gyp/paczkach, nie w tym projekcie — jak tylko ekosystem
// się dostosuje do Node 24 na Windows, ten skrypt stanie się zbędny.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const electronVersion = JSON.parse(readFileSync(join('node_modules', 'electron', 'package.json'), 'utf8')).version

// Oba moduły muszą być budowane pod nagłówki/ABI konkretnej wersji Electrona, nie hosta —
// Node sprawdza NODE_MODULE_VERSION przy dlopen niezależnie od tego, czy addon używa N-API
// wewnętrznie, więc moduł zbudowany pod Node 24 (NODE_MODULE_VERSION 137) nie wczyta się
// w Electronie (NODE_MODULE_VERSION 130) i odwrotnie.
const PACKAGES = [
  { name: 'better-sqlite3-multiple-ciphers', target: electronVersion },
  { name: 'keytar', target: electronVersion }
]

function findVcxprojFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) findVcxprojFiles(full, out)
    else if (entry.endsWith('.vcxproj')) out.push(full)
  }
  return out
}

function stripLtcg(vcxprojPath) {
  let content = readFileSync(vcxprojPath, 'utf8')
  const before = content
  content = content.replace(/<WholeProgramOptimization>true<\/WholeProgramOptimization>/g, '<WholeProgramOptimization>false</WholeProgramOptimization>')
  content = content.replace(/\/LTCG:INCREMENTAL\s*/g, '')
  content = content.replace(/\/LTCG\s+/g, '')
  if (content !== before) {
    writeFileSync(vcxprojPath, content, 'utf8')
    console.log(`  patched ${vcxprojPath}`)
  }
}

const nodeGypBin = join(process.cwd(), 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')

for (const { name: pkg, target } of PACKAGES) {
  const pkgDir = join(process.cwd(), 'node_modules', pkg)
  console.log(`\n== ${pkg}${target ? ` (target electron ${target})` : ''} ==`)

  const vsArgs = process.platform === 'win32' ? ['--msvs_version=2022'] : []
  const targetArgs = [
    ...(target ? ['--target=' + target, '--dist-url=https://electronjs.org/headers', '--runtime=electron'] : []),
    ...vsArgs
  ]

  console.log('configure...')
  execFileSync(process.execPath, [nodeGypBin, 'configure', '--release', ...targetArgs], {
    cwd: pkgDir,
    stdio: 'inherit'
  })

  if (process.platform === 'win32') {
    const buildDir = join(pkgDir, 'build')
    console.log('patching LTCG out of generated .vcxproj files...')
    for (const f of findVcxprojFiles(buildDir)) stripLtcg(f)
  }

  console.log('build...')
  execFileSync(process.execPath, [nodeGypBin, 'build', '--release', ...targetArgs], {
    cwd: pkgDir,
    stdio: 'inherit'
  })
}

console.log('\nGotowe — natywne moduły skompilowane.')
