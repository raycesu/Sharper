#!/usr/bin/env node
/**
 * Next 16 dev expects manifests under `.next/dev/` before the first compile.
 * If you only have a production `.next/` output, copy the needed files across
 * so `next dev` does not 500 with MODULE_NOT_FOUND / ENOENT on manifests.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function copyIfExists(fromRel, toRel) {
  const from = path.join(root, fromRel)
  const to = path.join(root, toRel)
  if (!fs.existsSync(from)) return false
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  return true
}

const marker = path.join(root, '.next', 'server', 'middleware-manifest.json')

function runBuildWithRetries() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[prep-dev] Running \`next build\` (attempt ${attempt}/3)…`)
    const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: root })
    if (r.status === 0 && fs.existsSync(marker)) return
    console.warn('[prep-dev] Build failed or output incomplete; retrying after a short wait…')
    spawnSync('sleep', ['1'], { stdio: 'ignore' })
  }
  console.error('[prep-dev] `next build` did not produce `.next/server/middleware-manifest.json`.')
  process.exit(1)
}

if (!fs.existsSync(marker)) {
  console.log('[prep-dev] No production `.next` output yet.')
  runBuildWithRetries()
}

const pairs = [
  ['.next/server/middleware-manifest.json', '.next/dev/server/middleware-manifest.json'],
  ['.next/routes-manifest.json', '.next/dev/routes-manifest.json'],
  ['.next/server/app-paths-manifest.json', '.next/dev/server/app-paths-manifest.json'],
  ['.next/server/pages-manifest.json', '.next/dev/server/pages-manifest.json'],
]

let ok = true
for (const [from, to] of pairs) {
  if (!copyIfExists(from, to)) {
    console.error(`[prep-dev] Missing required file: ${from}`)
    ok = false
  }
}

if (!ok) process.exit(1)
console.log('[prep-dev] Dev manifest stubs synced from `.next/server`.')
