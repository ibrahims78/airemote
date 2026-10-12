'use strict'
/**
 * bundle.js — esbuild bundler for server-desktop
 * Inlines all JS dependencies into single files.
 * Only native modules (better-sqlite3, ssh2) are left external.
 */
const { execFileSync } = require('child_process')
const path = require('path')
const fs   = require('fs')

const ROOT    = path.join(__dirname, '..')
let ESBUILD = path.join(
  __dirname, '..', '..', '..', 'node_modules', '.pnpm', 'node_modules', '.bin',
  process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'
)
// On Windows prefer the real platform binary — avoids .cmd shim quoting issues with spaces in paths.
if (process.platform === 'win32') {
  try {
    const pnpmDir = path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm')
    const dirs = fs.readdirSync(pnpmDir).filter((d) => d.startsWith('@esbuild+win32-x64@')).sort()
    if (dirs.length) {
      const exe = path.join(pnpmDir, dirs[dirs.length - 1], 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe')
      if (fs.existsSync(exe)) ESBUILD = exe
    }
  } catch {}
}

// ssh2 is bundled (cpu-features is optional and gracefully skipped)
// Only truly native modules that cannot be bundled stay external
const EXTERNALS = [
  'electron',
  'better-sqlite3',
  'cpu-features',
  '*.node',
].map(e => `--external:${e}`).join(' ')

const entries = [
  { in: 'server.js',  out: 'server.bundle.js'  },
  { in: 'backup.js',  out: 'backup.bundle.js'  },
  { in: 'tunnel.js',  out: 'tunnel.bundle.js'  },
  { in: 'logger.js',  out: 'logger.bundle.js'  },
]

console.log('📦 Bundling server-desktop JS files with esbuild...')

for (const { in: entry, out: outfile } of entries) {
  const args = [
    path.join(ROOT, entry),
    `--outfile=${path.join(ROOT, outfile)}`,
    '--bundle',
    '--platform=node',
    '--target=node18',
    '--format=cjs',
    ...EXTERNALS.split(' '),
    '--log-level=warning',
  ]

  try {
    execFileSync(ESBUILD, args, { stdio: 'inherit' })
    const size = (fs.statSync(path.join(ROOT, outfile)).size / 1024).toFixed(1)
    console.log(`✅ ${entry} → ${outfile} (${size} KB)`)
  } catch (e) {
    console.error(`❌ Failed to bundle ${entry}:`, e.message)
    process.exit(1)
  }
}

console.log('✅ All bundles ready.')
